import type { Book } from '../models/item';

export type RootStackParamList = {
  MainTabs: undefined;
  BookDetail: { bookId: string };
  Reader: { book: Book };
  SettingsGroup: { group: 'general' | 'account' | 'theme' | 'api' | 'about' };
  ListDetail: { collectionKey: string; listId?: string; title: string };
};

export type MainTabParamList = {
  Library: undefined;
  Lists: undefined;
  Settings: undefined;
};
