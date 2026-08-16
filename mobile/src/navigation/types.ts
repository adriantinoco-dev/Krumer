import type { Book } from '../models/item';

export type RootStackParamList = {
  MainTabs: undefined;
  Reader: { book: Book };
  SettingsGroup: { group: 'general' | 'theme' | 'api' | 'about' };
};

export type MainTabParamList = {
  Library: undefined;
  Lists: undefined;
  Settings: undefined;
};
