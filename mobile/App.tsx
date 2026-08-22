import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BookOpen, List, Settings } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { AuthProvider } from './src/context/AuthContext';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ListsScreen } from './src/screens/ListsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { SettingsGroupScreen } from './src/screens/SettingsGroupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import type { MainTabParamList, RootStackParamList } from './src/navigation/types';
import { serifFont } from './src/theme';
import { SyncCoordinator } from './src/sync/SyncCoordinator';

const Tabs = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  const { theme, t } = useApp();

  return (
    <Tabs.Navigator
      initialRouteName="Library"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: {
          fontFamily: serifFont,
        },
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
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
      <Stack.Navigator screenOptions={{ headerTintColor: theme.textPrimary, headerStyle: { backgroundColor: theme.bg } }}>
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
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
