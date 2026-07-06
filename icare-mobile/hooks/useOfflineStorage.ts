import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

const OFFLINE_KEY = '@icare_offline_data';
const OFFLINE_TIMESTAMP_KEY = '@icare_offline_timestamp';

interface OfflineData {
  vitals?: string;
  tasks?: string;
  ehr?: string;
  quizzes?: string;
  notifications?: string;
  performance?: string;
}

export function useOfflineStorage() {
  const [isOnline, setIsOnline] = React.useState(true);
  const [lastSync, setLastSync] = React.useState<Date | null>(null);

  React.useEffect(() => {
    checkOnlineStatus();
    loadLastSync();
    
    const interval = setInterval(checkOnlineStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkOnlineStatus = () => {
    setIsOnline(true);
  };

  const loadLastSync = async () => {
    try {
      const timestamp = await AsyncStorage.getItem(OFFLINE_TIMESTAMP_KEY);
      if (timestamp) {
        setLastSync(new Date(timestamp));
      }
    } catch (error) {
      console.error('Failed to load last sync:', error);
    }
  };

  const saveOfflineData = async (key: keyof OfflineData, data: unknown) => {
    try {
      const existing = await AsyncStorage.getItem(OFFLINE_KEY);
      const offlineData: OfflineData = existing ? JSON.parse(existing) : {};
      
      offlineData[key] = JSON.stringify(data);
      await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(offlineData));
    } catch (error) {
      console.error('Failed to save offline data:', error);
    }
  };

  const getOfflineData = async <T,>(key: keyof OfflineData): Promise<T | null> => {
    try {
      const existing = await AsyncStorage.getItem(OFFLINE_KEY);
      if (!existing) return null;
      
      const offlineData: OfflineData = JSON.parse(existing);
      if (offlineData[key]) {
        return JSON.parse(offlineData[key]);
      }
      return null;
    } catch (error) {
      console.error('Failed to get offline data:', error);
      return null;
    }
  };

  const clearOfflineData = async () => {
    try {
      await AsyncStorage.removeItem(OFFLINE_KEY);
      await AsyncStorage.removeItem(OFFLINE_TIMESTAMP_KEY);
      setLastSync(null);
    } catch (error) {
      console.error('Failed to clear offline data:', error);
    }
  };

  return {
    isOnline,
    lastSync,
    saveOfflineData,
    getOfflineData,
    clearOfflineData,
  };
}