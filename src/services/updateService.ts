import Constants from 'expo-constants';
import { supabase, hasValidSupabaseConfig } from '../lib/supabase';
import { logger } from '../utils/logger';

/**
 * Service to check if app update is required
 */
class UpdateService {
  private static instance: UpdateService;
  private updateRequired: boolean = false;
  private minRequiredVersion: string | null = null;

  private constructor() {}

  static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  /**
   * Get current app version
   */
  getCurrentVersion(): string {
    return Constants.expoConfig?.version || '1.0.1';
  }

  /**
   * Check if update is required
   * This checks the force_update_required column in app_setting table
   * If TRUE: Force update screen (locks the app)
   * If FALSE: Do not show update screen
   */
  async checkUpdateRequired(): Promise<boolean> {
    try {
      // First, check force_update_required from app_setting table
      if (hasValidSupabaseConfig) {
        const { data, error } = await supabase
          .from('app_setting')
          .select('force_update_required')
          .eq('id', '00000000-0000-0000-0000-000000000000')
          .single();

        if (!error && data?.force_update_required === true) {
          // Force update is required - lock the app with update screen
          this.updateRequired = true;
          return true;
        }

        // If force_update_required is false or not set, don't show update screen
        if (!error && data?.force_update_required === false) {
          this.updateRequired = false;
          return false;
        }
      }

      // Fallback: Check version comparison if force_update_required is not set
      const currentVersion = this.getCurrentVersion();

      // Option: Hardcoded minimum version (for testing)
      // Set this to a version higher than current to test the update screen
      const hardcodedMinVersion = '1.0.1'; // Change this to test
      
      if (hardcodedMinVersion) {
        this.minRequiredVersion = hardcodedMinVersion;
        this.updateRequired = this.compareVersions(currentVersion, hardcodedMinVersion) < 0;
        return this.updateRequired;
      }

      return false;
    } catch (error) {
      logger.error('Error checking update requirement:', error);
      return false;
    }
  }

  /**
   * Compare two version strings
   * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const maxLength = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxLength; i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }

    return 0;
  }

  /**
   * Get minimum required version
   */
  getMinRequiredVersion(): string | null {
    return this.minRequiredVersion;
  }

  /**
   * Manually set update required (for testing)
   */
  setUpdateRequired(required: boolean): void {
    this.updateRequired = required;
  }

  /**
   * Check if update is currently required (cached value)
   */
  isUpdateRequired(): boolean {
    return this.updateRequired;
  }
}

export const updateService = UpdateService.getInstance();
