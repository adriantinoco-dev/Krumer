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
          fontSize: 11,
        },
        tabBarBackground: () => (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: -12,
              backgroundColor: theme.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
            }}
          />
        ),
        tabBarStyle: {
          position: 'absolute',
          bottom: 12,
          left: 20,
          right: 20,
          height: 72,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          borderWidth: 0,
          paddingBottom: 16,
          paddingTop: 6,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
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
