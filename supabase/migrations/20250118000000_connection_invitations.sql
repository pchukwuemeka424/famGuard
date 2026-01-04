-- ============================================
-- Connection Invitations by Phone Number
-- Migration: 20250118000000
-- ============================================

-- ============================================
-- CONNECTION INVITATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS connection_invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  inviter_name TEXT NOT NULL,
  inviter_phone TEXT,
  inviter_email TEXT,
  inviter_photo TEXT,
  invitee_phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_connection_invitations_inviter_user_id ON connection_invitations(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_connection_invitations_invitee_phone ON connection_invitations(invitee_phone);
CREATE INDEX IF NOT EXISTS idx_connection_invitations_status ON connection_invitations(status);
CREATE INDEX IF NOT EXISTS idx_connection_invitations_expires_at ON connection_invitations(expires_at);
-- Note: Partial index with NOW() cannot be created as NOW() is not immutable
-- Instead, we'll use a regular index and filter in queries
CREATE INDEX IF NOT EXISTS idx_connection_invitations_pending ON connection_invitations(invitee_phone, status, expires_at);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_connection_invitations_updated_at ON connection_invitations;
CREATE TRIGGER update_connection_invitations_updated_at
  BEFORE UPDATE ON connection_invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Auto-expire old invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void AS $$
BEGIN
  UPDATE connection_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function: Accept invitation and create connection
CREATE OR REPLACE FUNCTION accept_connection_invitation(
  p_invitation_id UUID,
  p_invitee_user_id TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  connection_id UUID
) AS $$
DECLARE
  v_invitation connection_invitations%ROWTYPE;
  v_inviter_user_id TEXT;
  v_inviter_name TEXT;
  v_inviter_email TEXT;
  v_inviter_phone TEXT;
  v_inviter_photo TEXT;
  v_invitee_user_id TEXT;
  v_invitee_name TEXT;
  v_invitee_email TEXT;
  v_invitee_phone TEXT;
  v_invitee_photo TEXT;
  v_connection_id UUID;
  v_existing_connection_id UUID;
BEGIN
  -- Get invitation details
  SELECT * INTO v_invitation
  FROM connection_invitations
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invitation not found or expired'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Get inviter details
  SELECT id, name, email, phone, photo
  INTO v_inviter_user_id, v_inviter_name, v_inviter_email, v_inviter_phone, v_inviter_photo
  FROM users
  WHERE id = v_invitation.inviter_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Inviter user not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Get invitee details
  SELECT id, name, email, phone, photo
  INTO v_invitee_user_id, v_invitee_name, v_invitee_email, v_invitee_phone, v_invitee_photo
  FROM users
  WHERE id = p_invitee_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Invitee user not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Verify phone number matches
  IF v_invitee_phone != v_invitation.invitee_phone THEN
    RETURN QUERY SELECT false, 'Phone number mismatch'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check if already connected
  SELECT id INTO v_existing_connection_id
  FROM connections
  WHERE (user_id = v_inviter_user_id AND connected_user_id = v_invitee_user_id)
     OR (user_id = v_invitee_user_id AND connected_user_id = v_inviter_user_id)
  LIMIT 1;

  IF v_existing_connection_id IS NOT NULL THEN
    -- Update invitation status
    UPDATE connection_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = p_invitation_id;
    
    RETURN QUERY SELECT true, 'Already connected'::TEXT, v_existing_connection_id;
    RETURN;
  END IF;

  -- Create connection from inviter to invitee
  INSERT INTO connections (
    user_id,
    connected_user_id,
    connected_user_name,
    connected_user_email,
    connected_user_phone,
    connected_user_photo,
    status
  )
  VALUES (
    v_inviter_user_id,
    v_invitee_user_id,
    v_invitee_name,
    v_invitee_email,
    v_invitee_phone,
    v_invitee_photo,
    'connected'
  )
  RETURNING id INTO v_connection_id;

  -- Update invitation status
  UPDATE connection_invitations
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = p_invitation_id;

  -- Create notification for inviter
  INSERT INTO notifications (
    user_id,
    title,
    body,
    type,
    data
  )
  VALUES (
    v_inviter_user_id,
    'Connection Accepted',
    v_invitee_name || ' accepted your connection invitation',
    'connection_added',
    jsonb_build_object(
      'connectionId', v_connection_id,
      'invitationId', p_invitation_id
    )
  );

  RETURN QUERY SELECT true, 'Connection created successfully'::TEXT, v_connection_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE connection_invitations ENABLE ROW LEVEL SECURITY;

-- CONNECTION INVITATIONS POLICIES
DROP POLICY IF EXISTS "Users can read invitations they sent" ON connection_invitations;
DROP POLICY IF EXISTS "Users can read invitations they received" ON connection_invitations;
DROP POLICY IF EXISTS "Users can create invitations" ON connection_invitations;
DROP POLICY IF EXISTS "Users can update invitations they received" ON connection_invitations;

CREATE POLICY "Users can read invitations they sent"
  ON connection_invitations FOR SELECT
  USING (true);

CREATE POLICY "Users can read invitations they received"
  ON connection_invitations FOR SELECT
  USING (true);

CREATE POLICY "Users can create invitations"
  ON connection_invitations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update invitations they received"
  ON connection_invitations FOR UPDATE
  USING (true);

-- ============================================
-- ENABLE REAL-TIME REPLICATION
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE connection_invitations;

