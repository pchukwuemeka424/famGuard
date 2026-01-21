# Database Connection Check Guide

## Quick Check Methods

### Method 1: Using Supabase SQL Editor (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **SQL Editor**
4. Run the SQL script: `supabase/check_location_history.sql`

### Method 2: Using psql Command Line

```bash
# Run the diagnostic script
./scripts/check_supabase_connection.sh

# Or connect directly
psql "postgresql://postgres:eYHNPishBvzReZ6P@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres"

# Then run SQL queries manually
```

### Method 3: Using TypeScript Script

```bash
# Make sure you have EXPO_PUBLIC_SUPABASE_ANON_KEY in .env
npx ts-node scripts/check-location-history.ts
```

## Connection String

**PostgreSQL Direct Connection:**
```
postgresql://postgres:eYHNPishBvzReZ6P@db.bbydsaxduuwbnwqmiant.supabase.co:5432/postgres
```

**Supabase URL:**
```
https://bbydsaxduuwbnwqmiant.supabase.co
```

## Quick SQL Queries

### Check table structure
```sql
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'location_history';
```

### Count records with/without accuracy
```sql
SELECT 
    COUNT(*) as total,
    COUNT(accuracy) as with_accuracy,
    COUNT(*) - COUNT(accuracy) as null_accuracy
FROM location_history;
```

### View recent entries
```sql
SELECT 
    id,
    user_id,
    latitude,
    longitude,
    accuracy,
    created_at
FROM location_history
ORDER BY created_at DESC
LIMIT 20;
```

### Find entries with NULL accuracy
```sql
SELECT 
    id,
    user_id,
    latitude,
    longitude,
    accuracy,
    created_at
FROM location_history
WHERE accuracy IS NULL
ORDER BY created_at DESC
LIMIT 20;
```

## Expected Results

After the fix, you should see:
- ✅ `accuracy` column exists and is `DOUBLE PRECISION`
- ✅ Recent entries have accuracy values (not NULL)
- ✅ Accuracy values are numeric (0 is valid)
- ✅ Only old entries might have NULL accuracy

## Troubleshooting

### If accuracy is still NULL:

1. **Check app is using latest code** - Ensure the fixed code is deployed
2. **Check location permissions** - GPS accuracy requires location permissions
3. **Check device GPS** - Some devices may not provide accuracy
4. **Verify inserts** - Check if new inserts include accuracy field

### Verify Code is Fixed:

Check that `src/services/locationService.ts` has:
```typescript
// Should NOT use: accuracy || null
// Should use: accuracy !== undefined && accuracy !== null ? accuracy : null
```
