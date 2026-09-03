import React from 'react';
import { StatusBar, useWindowDimensions, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BookOpen, List, Settings } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { AuthProvider } from './src/context/AuthContext';
import { BookDetailScreen } from './src/screens/BookDetailScreen';
import { LibraryScreen } from './src/screens/LibraryScreen';
import { ListDetailScreen } from './src/screens/ListDetailScreen';
import { ListsScreen } from './src/screens/ListsScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ReaderSessionHost, ReaderSessionProvider } from './src/readers/ReaderSessionHost';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { SettingsGroupScreen } from './src/screens/SettingsGroupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import type { MainTabParamList, RootStackParamList } from './src/navigation/types';
import { serifFont, TABLET_BREAKPOINT } from './src/theme';
import { SyncCoordinator } from './src/sync/SyncCoordinator';
import { usePortraitOrientation } from './src/readers/useOrientation';
import { StartupLoadingScreen } from './src/components/StartupLoadingScreen';
import { UpdateModal } from './src/components/UpdateModal';
import { UpdateProvider, useUpdate } from './src/context/UpdateContext';

const Tabs = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  const { height, width } = useWindowDimensions();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { theme, t } = useApp();
  const tabBarIsWide = width >= TABLET_BREAKPOINT;
  const tabBarIsCompact = width < 360 || height < 600;
  const tabBarHorizontalMargin = tabBarIsWide ? 16 : tabBarIsCompact ? 12 : 20;
  const tabBarMaxWidth = tabBarIsWide ? 420 : 360;
  const tabBarWidth = Math.max(0, Math.min(width - tabBarHorizontalMargin * 2, tabBarMaxWidth));
  const tabBarHeight = tabBarIsCompact ? 56 : 62;
  const tabIconSize = tabBarIsCompact ? 18 : 20;
  const tabLabelSize = tabBarIsCompact ? 10 : 11;
  const tabBarBottom = Math.max(12, bottomInset + 8);

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
          fontSize: tabLabelSize,
          lineHeight: tabBarIsCompact ? 12 : 14,
        },
        tabBarItemStyle: { paddingHorizontal: tabBarIsCompact ? 0 : 2 },
        tabBarStyle: {
          position: 'absolute',
          bottom: tabBarBottom,
          left: (width - tabBarWidth) / 2,
          width: tabBarWidth,
          height: tabBarHeight,
          borderRadius: tabBarHeight / 2,
          backgroundColor: theme.card,
          borderWidth: 1,
          borderColor: theme.border,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingBottom: tabBarIsCompact ? 5 : 8,
          paddingTop: tabBarIsCompact ? 5 : 8,
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
          tabBarIcon: ({ color }) => <BookOpen color={color} size={tabIconSize} />,
          tabBarLabel: t('tab.library'),
        }}
      />
      <Tabs.Screen
        name="Lists"
        component={ListsScreen}
        options={{
          tabBarIcon: ({ color }) => <List color={color} size={tabIconSize} />,
          tabBarLabel: t('tab.lists'),
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color }) => <Settings color={color} size={tabIconSize} />,
          tabBarLabel: t('tab.settings'),
        }}
      />
    </Tabs.Navigator>
  );
}

function AppShell() {
  const { preferences, preferencesReady, ready, theme } = useApp();
  const [startupVisible, setStartupVisible] = React.useState(true);
  const hideStartup = React.useCallback(() => setStartupVisible(false), []);
  const update = useUpdate();
  usePortraitOrientation();
  const statusBarStyle: 'light-content' | 'dark-content' = theme.name === 'dark' ? 'light-content' : 'dark-content';
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

  if (!preferencesReady) return null;

  return (
    <View style={{ backgroundColor: theme.bg, flex: 1 }}>
      <StatusBar animated barStyle={statusBarStyle} />
      {ready && (!preferences.hasOnboarded ? (
        <OnboardingScreen />
      ) : (
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
      ))}
      <ReaderSessionHost />
      {startupVisible && <StartupLoadingScreen ready={ready} onFinished={hideStartup} />}
      <UpdateModal
        visible={update.status !== 'idle' && update.status !== 'checking'}
        status={update.status}
        updateInfo={update.updateInfo}
        downloadProgress={update.downloadProgress}
        error={update.error}
        onDownload={update.startDownload}
        onInstall={update.installUpdate}
        onOpenSettings={update.openSettings}
        onDismiss={update.dismissUpdate}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppProvider>
          <ReaderSessionProvider>
            <SyncCoordinator />
            <UpdateProvider>
              <AppShell />
            </UpdateProvider>
          </ReaderSessionProvider>
        </AppProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
