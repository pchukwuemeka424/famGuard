import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { AppSetting } from '../types';

interface AppSettingContextType {
  appSetting: AppSetting | null;
  loading: boolean;
  hideReportIncident: boolean;
  hideIncident: boolean;
  sosLock: boolean;
  refreshSettings: () => Promise<void>;
}

const AppSettingContext = createContext<AppSettingContextType | undefined>(undefined);

export const useAppSetting = (): AppSettingContextType => {
  const context = useContext(AppSettingContext);
  if (!context) {
    throw new Error('useAppSetting must be used within AppSettingProvider');
  }
  return context;
};

interface AppSettingProviderProps {
  children: ReactNode;
}

export const AppSettingProvider: React.FC<AppSettingProviderProps> = ({ children }) => {
  const [appSetting, setAppSetting] = useState<AppSetting | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAppSettings = async (): Promise<void> => {
    try {
      setLoading(true);
      // Explicitly select the status fields from app_setting table
      const { data, error } = await supabase
        .from('app_setting')
        .select('id, hide_report_incident, hide_incident, sos_lock, created_at, updated_at')
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .single();

      if (error) {
        console.error('Error fetching app settings:', error);
        // Set defaults if fetch fails
        setAppSetting({
          id: '00000000-0000-0000-0000-000000000000',
          hide_report_incident: false,
          hide_incident: false,
          sos_lock: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else if (data) {
        console.log('App settings fetched from database:', {
          hide_report_incident: data.hide_report_incident,
          hide_incident: data.hide_incident,
          sos_lock: data.sos_lock,
          fullData: data,
        });
        setAppSetting(data as AppSetting);
      } else {
        console.warn('No app settings data returned from database');
        // Set defaults if no data
        setAppSetting({
          id: '00000000-0000-0000-0000-000000000000',
          hide_report_incident: false,
          hide_incident: false,
          sos_lock: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error fetching app settings:', error);
      // Set defaults on error
      setAppSetting({
        id: '00000000-0000-0000-0000-000000000000',
        hide_report_incident: false,
        hide_incident: false,
        sos_lock: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshSettings = async (): Promise<void> => {
    await fetchAppSettings();
  };

  useEffect(() => {
    fetchAppSettings();

    // Set up real-time subscription for app settings changes
    const channel = supabase
      .channel('app_setting_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_setting',
          filter: 'id=eq.00000000-0000-0000-0000-000000000000',
        },
        (payload) => {
          console.log('App setting changed via real-time:', payload);
          if (payload.new) {
            const newSettings = payload.new as AppSetting;
            console.log('Updated app settings:', {
              hide_report_incident: newSettings.hide_report_incident,
              hide_incident: newSettings.hide_incident,
              sos_lock: newSettings.sos_lock,
            });
            setAppSetting(newSettings);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Extract status values from app_setting - explicitly use the database values
  const hideReportIncident = appSetting?.hide_report_incident === true;
  const hideIncident = appSetting?.hide_incident === true;
  const sosLock = appSetting?.sos_lock === true;

  // Debug logging - show current status values
  useEffect(() => {
    if (!loading) {
      console.log('App Setting Status (Current Values):', {
        hideReportIncident,
        hideIncident,
        sosLock,
        rawValues: {
          hide_report_incident: appSetting?.hide_report_incident,
          hide_incident: appSetting?.hide_incident,
          sos_lock: appSetting?.sos_lock,
        },
        appSettingExists: !!appSetting,
      });
    }
  }, [loading, appSetting, hideReportIncident, hideIncident, sosLock]);

  return (
    <AppSettingContext.Provider
      value={{
        appSetting,
        loading,
        hideReportIncident,
        hideIncident,
        sosLock,
        refreshSettings,
      }}
    >
      {children}
    </AppSettingContext.Provider>
  );
};

