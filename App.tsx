import { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

import { auth } from "./src/firebase";

import AuthScreen from "./src/screens/AuthScreen";
import CinemaDetailScreen from "./src/screens/CinemaDetailScreen";
import MainTabs from "./src/navigation/MainTabs";

// Tabs shown after login (handled by our custom drawer-like menu)
export type MainTabParamList = {
  Home: undefined;
  AllCinemas: undefined;
  Favorites: undefined;
};

// Root stack (Login -> MainTabs -> CinemaDetail)
export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  CinemaDetail: { cinemaId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs">
              {(props) => <MainTabs {...props} user={user} />}
            </Stack.Screen>

            <Stack.Screen
              name="CinemaDetail"
              options={{ headerShown: true, title: "영화관 상세" }}
            >
              {(props) => <CinemaDetailScreen {...props} user={user} />}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
