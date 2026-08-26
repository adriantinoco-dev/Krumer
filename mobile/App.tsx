import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BookOpen, List, Settings } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { AuthProvider } from './src/context/AuthContext';
import { BookDetailScreen } from './src/screens/BookDetailScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ListDetailScreen } from './src/screens/ListDetailScreen';
import { ListsScreen } from './src/screens/ListsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { SettingsGroupScreen } from './src/screens/SettingsGroupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import type { MainTabParamList, RootStackParamList } from './src/navigation/types';
import { serifFont } from './src/theme';
import { SyncCoordinator } from './src/sync/SyncCoordinator';
import { usePortraitOrientation } from './src/readers/useOrientation';

const Tabs = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  const { theme, t } = useApp();

  return (
    <Tabs.Navigator
      initialRouteName="Library"
      sceneContainerStyle={{ backgroundColor: theme.bg }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: {
          fontFamily: serifFont,
          fontSize: 11,
        },
        tabBarStyle: {
          position: 'absolute',
          bottom: 20,
          left: 68,
          right: 68,
          height: 62,
          borderRadius: 31,
          backgroundColor: theme.card,
          borderWidth: 1,
          borderColor: theme.border,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 10,
        },
      }}
    >
      <Tabs.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          tabBarIcon: ({ color }) => <BookOpen color={color} size={20} />,
          tabBarLabel: t('tab.library'),
        }}
      />
      <Tabs.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          tabBarIcon: ({ color }) => <List color={color} size={20} />,
          tabBarLabel: t('tab.lists'),
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color }) => <Settings color={color} size={20} />,
          tabBarLabel: t('tab.settings'),
        }}
      />
    </Tabs.Navigator>
  );
}

function AppShell() {
  const { preferences, ready, theme } = useApp();
  usePortraitOrientation();
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: theme.bg,
      border: theme.border,
      card: theme.surface,
      primary: theme.accent,
      text: theme.textPrimary,
    },
  };

  if (!ready) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: theme.bg, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
        <Text style={{ color: theme.textSecondary, fontFamily: serifFont, marginTop: 12 }}>Krumer</Text>
      </View>
    );
  }

  if (!preferences.hasOnboarded) {
    return <OnboardingScreen />;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          contentStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.accent,
          headerStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="ListDetail" component={ListDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="BookDetail" component={BookDetailScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Reader" component={ReaderScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SettingsGroup" component={SettingsGroupScreen} options={{ title: '' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <SyncCoordinator />
          <AppShell />
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
