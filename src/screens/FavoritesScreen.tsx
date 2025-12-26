import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import type { User } from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";

type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
};

export default function FavoritesScreen({ user }: { user: User }) {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [items, setItems] = useState<Theater[]>([]);
    const [loading, setLoading] = useState(true);

    const PAGE_SIZE = 5;
    const [page, setPage] = useState(1);

    const [removingId, setRemovingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // load favorites
    useEffect(() => {
        let alive = true;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const favSnap = await getDocs(collection(db, "users", user.uid, "favorites"));
                const ids = favSnap.docs.map((d) => d.id);

                const cinemas = await Promise.all(
                    ids.map(async (cinemaId) => {
                        const s = await getDoc(doc(db, "cinema", cinemaId));
                        if (!s.exists()) return null;
                        const raw = s.data() as Record<string, unknown>;
                        const c: Theater = {
                            id: s.id,
                            name: String(raw.name ?? ""),
                            address: String(raw.address ?? ""),
                            lat: Number(raw.lat),
                            lng: Number(raw.lng),
                            tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
                        };
                        return c;
                    })
                );

                const nextItems = cinemas.filter(Boolean) as Theater[];
                if (!alive) return;

                setItems(nextItems);
                setPage(1);
            } catch (e) {
                if (!alive) return;
                setError(String(e));
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        };

        void load();

        return () => {
            alive = false;
        };
    }, [user.uid]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / PAGE_SIZE)), [items.length]);

    const pagedItems = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return items.slice(start, start + PAGE_SIZE);
    }, [items, page]);

    useEffect(() => {
        // items가 줄어들었을 때 현재 페이지가 범위를 벗어나면 보정
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const unfavorite = async (cinemaId: string) => {
        Alert.alert("관심 해제", "관심 영화관에서 삭제할까요?", [
            { text: "취소", style: "cancel" },
            {
                text: "해제",
                style: "destructive",
                onPress: async () => {
                    try {
                        setError(null);
                        setRemovingId(cinemaId);

                        await deleteDoc(doc(db, "users", user.uid, "favorites", cinemaId));
                        setItems((prev) => prev.filter((x) => x.id !== cinemaId));
                    } catch (e) {
                        setError(String(e));
                    } finally {
                        setRemovingId(null);
                    }
                },
            },
        ]);
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
                <Text style={styles.muted}>로딩중...</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {/* header row */}
            <View style={[styles.card, styles.row, { alignItems: "center" }]}>
                <Text style={styles.title}>나의 관심 영화관</Text>

                {items.length > PAGE_SIZE && (
                    <View style={[styles.row, { gap: 8, marginLeft: "auto" }]}>
                        <TouchableOpacity
                            style={styles.btn}
                            disabled={page <= 1}
                            onPress={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            <Text style={styles.btnText}>이전</Text>
                        </TouchableOpacity>

                        <Text style={styles.muted}>
                            {page} / {totalPages}
                        </Text>

                        <TouchableOpacity
                            style={styles.btn}
                            disabled={page >= totalPages}
                            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                            <Text style={styles.btnText}>다음</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Text style={[styles.muted, { marginLeft: 10 }]}>{items.length}개</Text>
            </View>

            {!!error && <Text style={styles.err}>{error}</Text>}

            {items.length === 0 ? (
                <View style={styles.card}>
                    <Text style={styles.muted}>아직 관심 등록한 영화관이 없습니다.</Text>
                </View>
            ) : (
                <View style={{ gap: 12 }}>
                    {pagedItems.map((t) => (
                        <View key={t.id} style={styles.card}>
                            <View style={[styles.row, { alignItems: "center" }]}>
                                <Text style={styles.bold}>{t.name}</Text>

                                <View style={{ marginLeft: "auto", flexDirection: "row", gap: 10, alignItems: "center" }}>
                                    <TouchableOpacity
                                        style={styles.pill}
                                        onPress={() => navigation.navigate("CinemaDetail", { cinemaId: t.id })}
                                    >
                                        <Text style={styles.pillText}>상세 보기</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.btn, styles.btnDanger]}
                                        onPress={() => unfavorite(t.id)}
                                        disabled={removingId === t.id}
                                    >
                                        <Text style={styles.btnText}>{removingId === t.id ? "해제 중..." : "💔 관심 해제"}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <Text style={[styles.muted, { marginTop: 6 }]}>{t.address}</Text>

                            {!!t.tags?.length && (
                                <Text style={[styles.muted, { marginTop: 8 }]}>태그: {t.tags.join(", ")}</Text>
                            )}
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 14, paddingBottom: 40, gap: 12, backgroundColor: "#05060f" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#05060f" },

    card: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderColor: "rgba(255,255,255,0.14)",
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
    },

    row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },

    title: { color: "rgba(255,255,255,0.92)", fontSize: 18, fontWeight: "800" },
    muted: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
    bold: { color: "rgba(255,255,255,0.92)", fontWeight: "800" },

    btn: {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderColor: "rgba(255,255,255,0.16)",
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
    },
    btnDanger: { borderColor: "rgba(248,113,113,0.45)" },
    btnText: { color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: "700" },

    pill: {
        borderColor: "rgba(255,255,255,0.16)",
        borderWidth: 1,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.05)",
    },
    pillText: { color: "rgba(255,255,255,0.92)", fontSize: 12, fontWeight: "700" },

    err: { marginTop: 10, color: "#fca5a5", fontSize: 12 },
});