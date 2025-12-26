import React, { useMemo, useState } from "react";
import type { User } from "firebase/auth";
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  Pressable,
  Platform,
} from "react-native";

// ✅ adjust these import paths if your folders differ
import HomeScreen from "../screens/HomeScreen";
import AllCinemasScreen from "../screens/AllCinemasScreen";
import FavoritesScreen from "../screens/FavoritesScreen";

type Props = { user: User; onLogout?: () => void };

type TabKey = "Home" | "AllCinemas" | "Favorites";

export default function MainTabs({ user, onLogout }: Props) {
  const [tab, setTab] = useState<TabKey>("Home");
  const [menuOpen, setMenuOpen] = useState(false);

  const title = useMemo(() => {
    switch (tab) {
      case "Home":
        return "홈";
      case "AllCinemas":
        return "특별 영화관 검색";
      case "Favorites":
        return "나의 관심 영화관";
      default:
        return "";
    }
  }, [tab]);

  // If your Screen components are typed with navigation/route props,
  // casting here prevents TS errors because we render them manually.
  const Home = HomeScreen as unknown as React.ComponentType<{ user: User }>;
  const AllCinemas = AllCinemasScreen as unknown as React.ComponentType<{ user: User }>;
  const Favorites = FavoritesScreen as unknown as React.ComponentType<{ user: User }>;

  return (
    <SafeAreaView style={styles.root}>
      {/* Top header (safe-area aware) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.appName}>Your Special Cinema</Text>
          <Text style={styles.subtitle}>{title}</Text>
        </View>

        <View style={styles.headerRight}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMenuOpen((v) => !v)}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Text style={styles.iconBtnText}>{menuOpen ? "✕" : "☰"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Slide-down menu */}
      {menuOpen && (
        <View style={styles.menu}>
          <Pressable
            onPress={() => {
              setTab("Home");
              setMenuOpen(false);
            }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Text style={styles.menuItemText}>🏠 홈</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setTab("AllCinemas");
              setMenuOpen(false);
            }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Text style={styles.menuItemText}>🛰️ 특별 영화관 검색</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setTab("Favorites");
              setMenuOpen(false);
            }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Text style={styles.menuItemText}>❤️ 나의 관심 영화관</Text>
          </Pressable>

          <View style={styles.menuDivider} />

          <Pressable
            onPress={() => {
              setMenuOpen(false);
              onLogout?.();
            }}
            style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
          >
            <Text style={[styles.menuItemText, styles.logoutText]}>🚪 로그아웃</Text>
          </Pressable>

          <Text style={styles.menuHint}>로그인: {user.displayName ?? user.email ?? ""}</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {tab === "Home" ? (
          <Home user={user} />
        ) : tab === "AllCinemas" ? (
          <AllCinemas user={user} />
        ) : (
          <Favorites user={user} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#05060f",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 10, android: 10, default: 10 }),
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexShrink: 1,
  },
  appName: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 2,
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  iconBtnPressed: {
    transform: [{ scale: 0.98 }],
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  iconBtnText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    fontWeight: "700",
  },
  menu: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(7,10,24,0.92)",
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 10,
  },
  menuItemPressed: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  menuItemText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    fontWeight: "700",
  },
  logoutText: {
    color: "#fca5a5",
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 6,
  },
  menuHint: {
    marginTop: 6,
    color: "rgba(255,255,255,0.60)",
    fontSize: 11,
  },
  content: {
    flex: 1,
  },
});