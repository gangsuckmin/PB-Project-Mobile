import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import * as Location from "expo-location";
import type { User } from "firebase/auth";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import type { Theater } from "../types/cinema";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList, MainTabParamList } from "../../App";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";



type Props = CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, "Home">,
    NativeStackScreenProps<RootStackParamList>
> & {
    user?: User;
};

type TheaterWithDistance = Theater & { distanceKm: number | null };

type RankItem = {
    cinemaId: string;
    cinemaName: string;
    tag: string;
    avgOverall: number;
    count: number;
};

const NEARBY_PAGE_SIZE = 8;

export default function HomeScreen({ navigation, user }: Props) {
    const uid = user?.uid ?? "";
    const { width, height } = useWindowDimensions();
    const isNarrow = width < 900; // iPhone/좁은 화면 = 세로 레이아웃

    const mapHeight = isNarrow ? Math.min(360, Math.max(280, Math.floor(height * 0.38))) : 460;

    const [theaters, setTheaters] = useState<Theater[]>([]);
    const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

    const [locError, setLocError] = useState<string | null>(null);
    const [locLoading, setLocLoading] = useState(false);

    const [ranking, setRanking] = useState<RankItem[]>([]);
    const [rankLoading, setRankLoading] = useState(false);

    const [radiusM, setRadiusM] = useState(10000); // 10km
    const [nearbyPage, setNearbyPage] = useState(1);

    const [favoriteCinemaIds, setFavoriteCinemaIds] = useState<Set<string>>(new Set());

    // 1) cinema 로드
    useEffect(() => {
        const load = async () => {
            const snap = await getDocs(collection(db, "cinema"));
            const list: Theater[] = snap.docs.map((d) => {
                const raw = d.data() as Record<string, unknown>;
                return {
                    id: d.id,
                    name: String(raw.name ?? ""),
                    address: String(raw.address ?? ""),
                    lat: Number(raw.lat),
                    lng: Number(raw.lng),
                    tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
                    brand: raw.brand ? (String(raw.brand) as any) : undefined,
                    region: raw.region ? (String(raw.region) as any) : undefined,
                };
            });
            setTheaters(list);
        };
        void load();
    }, []);

    // 2) favorites 로드
    useEffect(() => {
        const loadFavorites = async () => {
            if (!uid) return;
            try {
                const snap = await getDocs(collection(db, "users", uid, "favorites"));
                const s = new Set<string>();
                snap.docs.forEach((d) => s.add(d.id));
                setFavoriteCinemaIds(s);
            } catch {
                setFavoriteCinemaIds(new Set());
            }
        };
        void loadFavorites();
    }, [uid]);

    // 3) 랭킹 로드
    useEffect(() => {
        const loadRanking = async () => {
            setRankLoading(true);
            try {
                const items: RankItem[] = [];
                await Promise.all(
                    theaters.map(async (t) => {
                        const tags = t.tags ?? [];
                        await Promise.all(
                            tags.map(async (tag) => {
                                const statsRef = doc(db, "cinema", t.id, "tagReviews", tag, "stats", "summary");
                                const s = await getDoc(statsRef);
                                if (!s.exists()) return;
                                const raw = s.data() as any;
                                const avgOverall = Number(raw.avgOverall ?? 0);
                                const count = Number(raw.count ?? 0);
                                if (count > 0) items.push({ cinemaId: t.id, cinemaName: t.name, tag, avgOverall, count });
                            })
                        );
                    })
                );
                items.sort((a, b) => b.avgOverall - a.avgOverall);
                setRanking(items.slice(0, 10));
            } finally {
                setRankLoading(false);
            }
        };
        if (theaters.length > 0) void loadRanking();
    }, [theaters]);

    const top10CinemaIdSet = useMemo(() => {
        const s = new Set<string>();
        for (const r of ranking) s.add(r.cinemaId);
        return s;
    }, [ranking]);

    // 위치 새로고침
    const refreshLocation = async () => {
        setLocError(null);
        setLocLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setLocError("위치 권한이 필요합니다.");
                return;
            }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        } catch (e: any) {
            setLocError(String(e?.message ?? e));
        } finally {
            setLocLoading(false);
        }
    };

    useEffect(() => {
        void refreshLocation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const toRad = (x: number) => (x * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    };

    const theatersWithDistance: TheaterWithDistance[] = useMemo(() => {
        return theaters
            .map((t) => ({
                ...t,
                distanceKm: myPos ? haversineKm(myPos, { lat: t.lat, lng: t.lng }) : null,
            }))
            .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }, [theaters, myPos]);

    const nearbyWithinRadius = useMemo(() => {
        return theatersWithDistance
            .filter((t) => t.distanceKm !== null && (t.distanceKm as number) * 1000 <= radiusM)
            .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }, [theatersWithDistance, radiusM]);

    // pagination reset
    useEffect(() => {
        setNearbyPage(1);
    }, [radiusM, myPos, theaters.length]);

    const nearbyTotalPages = useMemo(() => {
        return Math.max(1, Math.ceil(nearbyWithinRadius.length / NEARBY_PAGE_SIZE));
    }, [nearbyWithinRadius.length]);

    const nearbyPaged = useMemo(() => {
        const start = (nearbyPage - 1) * NEARBY_PAGE_SIZE;
        return nearbyWithinRadius.slice(start, start + NEARBY_PAGE_SIZE);
    }, [nearbyWithinRadius, nearbyPage]);

    useEffect(() => {
        if (nearbyPage > nearbyTotalPages) setNearbyPage(nearbyTotalPages);
    }, [nearbyPage, nearbyTotalPages]);

    // 지도 초기 region
    const initialRegion: Region = useMemo(() => {
        const fallback = { latitude: 37.5665, longitude: 126.978, latitudeDelta: 0.06, longitudeDelta: 0.06 };
        if (myPos) return { latitude: myPos.lat, longitude: myPos.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 };
        if (theatersWithDistance.length > 0)
            return {
                latitude: theatersWithDistance[0].lat,
                longitude: theatersWithDistance[0].lng,
                latitudeDelta: 0.06,
                longitudeDelta: 0.06,
            };
        return fallback;
    }, [myPos, theatersWithDistance]);

    // myPos 바뀌면 recenter
    const [mapKey, setMapKey] = useState(0);
    useEffect(() => {
        if (myPos) setMapKey((k) => k + 1);
    }, [myPos]);

    const RadiusOptions = [
        { label: "1km", value: 1000 },
        { label: "3km", value: 3000 },
        { label: "5km", value: 5000 },
        { label: "10km", value: 10000 },
        { label: "30km", value: 30000 },
        { label: "50km", value: 50000 },
        { label: "100km", value: 100000 },
    ] as const;

    return (
        <View style={styles.screen}>
            {/* ✅ iPhone에서 아래로 밀리는 문제 해결: 전체를 ScrollView로 */}
            <ScrollView
                contentContainerStyle={[
                    styles.homeLayout,
                    isNarrow && styles.homeLayoutNarrow,
                    { paddingBottom: 24 },
                ]}
                showsVerticalScrollIndicator={false}
            >
                {/* Ranking */}
                <View style={[styles.glass, styles.card, styles.leftCard, isNarrow && styles.leftCardNarrow]}>
                    <View style={styles.row}>
                        <Text style={styles.title}>⭐특별 상영관 랭킹 TOP10⭐</Text>
                        <Text style={styles.muted}>{rankLoading ? "계산 중..." : ""}</Text>
                    </View>

                    <ScrollView style={styles.rankScroll} contentContainerStyle={{ paddingBottom: 10 }}>
                        {ranking.length === 0 ? (
                            <Text style={styles.muted}>아직 랭킹 데이터가 없어요.</Text>
                        ) : (
                            ranking.map((r, idx) => (
                                <Pressable
                                    key={`${r.cinemaId}-${r.tag}`}
                                    onPress={() => navigation.navigate("CinemaDetail", { cinemaId: r.cinemaId })}
                                    style={styles.rankItem}
                                >
                                    <Text style={styles.rankLink}>
                                        [{idx + 1}위] {r.cinemaName}
                                        {"\n"}
                                        {r.tag}
                                    </Text>
                                    <Text style={styles.muted}>
                                        {r.avgOverall.toFixed(1)}점({r.count}명)
                                    </Text>
                                </Pressable>
                            ))
                        )}
                    </ScrollView>
                </View>

                {/* Right */}
                <View style={[styles.rightCol, isNarrow && styles.rightColNarrow]}>
                    {/* Nearby */}
                    <View style={[styles.glass, styles.card]}>
                        <View style={styles.rowWrap}>
                            <Text style={styles.title}>내 주변 특별 영화관</Text>
                            {locError ? <Text style={styles.error}>{locError}</Text> : null}
                        </View>

                        <View style={[styles.split, isNarrow && styles.splitNarrow]}>
                            {/* controls */}
                            <View style={[styles.controls, isNarrow && styles.controlsNarrow]}>
                                <Pressable onPress={refreshLocation} disabled={locLoading} style={[styles.btn, styles.btnPrimary]}>
                                    {locLoading ? <ActivityIndicator /> : <Text style={styles.btnText}>내 위치 새로고침</Text>}
                                </Pressable>

                                <View style={styles.radiusRow}>
                                    <Text style={styles.muted}>반경</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                        {RadiusOptions.map((opt) => (
                                            <Pressable
                                                key={opt.value}
                                                onPress={() => setRadiusM(opt.value)}
                                                style={[styles.pill, radiusM === opt.value && styles.pillActive]}
                                            >
                                                <Text style={[styles.pillText, radiusM === opt.value && styles.pillTextActive]}>
                                                    {opt.label}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                </View>
                            </View>

                            {/* list */}
                            <View style={styles.listCol}>
                                {nearbyWithinRadius.length === 0 ? (
                                    <Text style={styles.muted}>설정한 반경 내에 특별 영화관이 없습니다.</Text>
                                ) : (
                                    nearbyPaged.map((t) => (
                                        <Pressable
                                            key={t.id}
                                            onPress={() => navigation.navigate("CinemaDetail", { cinemaId: t.id })}
                                            style={styles.listItem}
                                        >
                                            <Text style={styles.listItemText} numberOfLines={2}>
                                                {t.name}
                                            </Text>
                                            <Text style={styles.muted}>({t.distanceKm?.toFixed(2)} km)</Text>
                                        </Pressable>
                                    ))
                                )}

                                {nearbyWithinRadius.length > NEARBY_PAGE_SIZE && (
                                    <View style={styles.pagerRow}>
                                        <Pressable
                                            style={[styles.btn, styles.btnSmall]}
                                            disabled={nearbyPage <= 1}
                                            onPress={() => setNearbyPage((p) => Math.max(1, p - 1))}
                                        >
                                            <Text style={styles.btnText}>이전</Text>
                                        </Pressable>

                                        <Text style={styles.muted}>
                                            {nearbyPage} / {nearbyTotalPages}
                                        </Text>

                                        <Pressable
                                            style={[styles.btn, styles.btnSmall]}
                                            disabled={nearbyPage >= nearbyTotalPages}
                                            onPress={() => setNearbyPage((p) => Math.min(nearbyTotalPages, p + 1))}
                                        >
                                            <Text style={styles.btnText}>다음</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Map */}
                    <View style={[styles.glass, styles.mapCard, { height: mapHeight }]}>
                        <MapView
                            key={mapKey}
                            // ✅ iOS Expo Go에서는 PROVIDER_GOOGLE 때문에 지도 흰 화면이 자주 나옴 → iOS는 기본 provider로
                            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                            style={styles.map}
                            initialRegion={initialRegion}
                        >
                            {myPos && (
                                <Circle
                                    center={{ latitude: myPos.lat, longitude: myPos.lng }}
                                    radius={radiusM}
                                    strokeWidth={2}
                                    strokeColor="#6fd3ff"
                                    fillColor="rgba(111,211,255,0.10)"
                                />
                            )}

                            {myPos && (
                                <Marker coordinate={{ latitude: myPos.lat, longitude: myPos.lng }}>
                                    <View style={styles.myMarker}>
                                        <View style={styles.myHead} />
                                        <View style={styles.myBody} />
                                    </View>
                                </Marker>
                            )}

                            {theatersWithDistance.map((t) => {
                                const isFav = favoriteCinemaIds.has(t.id);
                                const isTop10 = top10CinemaIdSet.has(t.id);

                                return (
                                    <Marker
                                        key={t.id}
                                        coordinate={{ latitude: t.lat, longitude: t.lng }}
                                        onPress={() => navigation.navigate("CinemaDetail", { cinemaId: t.id })}
                                    >
                                        {isFav ? (
                                            <Text style={styles.emojiMarker}>❤️</Text>
                                        ) : isTop10 ? (
                                            <Text style={styles.emojiMarker}>⭐</Text>
                                        ) : (
                                            <View style={styles.redDot} />
                                        )}
                                    </Marker>
                                );
                            })}
                        </MapView>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#05060f" },

    // ✅ ScrollView contentContainerStyle로 쓸 거라 flex:1 제거
    homeLayout: {
        flexDirection: "row",
        gap: 14,
        padding: 14,
    },
    homeLayoutNarrow: {
        flexDirection: "column",
    },

    leftCard: { width: 320 },
    leftCardNarrow: { width: "100%" },

    rightCol: { flex: 1, gap: 12 },
    rightColNarrow: { width: "100%" },

    glass: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderColor: "rgba(255,255,255,0.14)",
        borderWidth: 1,
        borderRadius: 16,
        overflow: "hidden",
    },

    card: { padding: 14 },

    title: { color: "rgba(255,255,255,0.92)", fontSize: 18, fontWeight: "800" },
    muted: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
    error: { marginTop: 6, color: "#fca5a5", fontSize: 12 },

    row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    rowWrap: { gap: 6 },

    rankScroll: { marginTop: 10 },
    rankItem: {
        paddingBottom: 10,
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.08)",
    },
    rankLink: { color: "rgba(255,255,255,0.92)", fontSize: 15, fontWeight: "700" },

    split: { marginTop: 12, flexDirection: "row", gap: 14 },
    splitNarrow: { flexDirection: "column" },

    controls: { width: 260, gap: 12 },
    controlsNarrow: { width: "100%" },

    listCol: { flex: 1, gap: 10 },

    btn: {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderColor: "rgba(255,255,255,0.16)",
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        alignSelf: "flex-start",
    },
    btnPrimary: {
        borderColor: "rgba(111,211,255,0.30)",
        backgroundColor: "rgba(111,211,255,0.10)",
    },
    btnSmall: { paddingVertical: 6, paddingHorizontal: 10 },
    btnText: { color: "rgba(255,255,255,0.92)", fontWeight: "700" },

    radiusRow: { gap: 8 },

    pill: {
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    pillActive: { borderColor: "rgba(111,211,255,0.45)", backgroundColor: "rgba(111,211,255,0.12)" },
    pillText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "700" },
    pillTextActive: { color: "rgba(255,255,255,0.92)" },

    listItem: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    listItemText: { color: "rgba(255,255,255,0.92)", fontWeight: "700" },

    pagerRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10 },

    mapCard: { padding: 0 },
    map: { width: "100%", height: "100%" },

    redDot: {
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: "#ef4444",
        borderWidth: 2,
        borderColor: "white",
    },
    emojiMarker: { fontSize: 16 },

    myMarker: { alignItems: "center" },
    myHead: { width: 14, height: 14, borderRadius: 999, backgroundColor: "#2563eb" },
    myBody: { marginTop: 2, width: 22, height: 12, borderRadius: 999, backgroundColor: "#2563eb" },
});
