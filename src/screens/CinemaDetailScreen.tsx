import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import type { User } from "firebase/auth";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import Slider from "@react-native-community/slider";
import { db } from "../firebase";

type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
};

type Review = {
    id: string; // uid (문서ID=uid)
    userId: string;
    displayName: string;
    screen: number;
    picture: number;
    sound: number;
    seat: number;
    comment: string;
    likeCount: number;
};

type ReviewForm = {
    screen: number;
    picture: number;
    sound: number;
    seat: number;
    comment: string;
};

type SortMode = "latest" | "likes";

type Props = NativeStackScreenProps<RootStackParamList, "CinemaDetail"> & {
    user: User;
};

export default function CinemaDetailScreen({ route, navigation, user }: Props) {
    const cinemaId = route.params.cinemaId;

    const [cinema, setCinema] = useState<Theater | null>(null);

    // pagination
    const PAGE_SIZE = 4;
    const [page, setPage] = useState(1);

    // favorites
    const [isFavorite, setIsFavorite] = useState(false);
    const [favBusy, setFavBusy] = useState(false);

    // tag
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    // reviews
    const [sortMode, setSortMode] = useState<SortMode>("latest");
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewLoadError, setReviewLoadError] = useState<string | null>(null);

    const [savingReview, setSavingReview] = useState(false);
    const [myReview, setMyReview] = useState<ReviewForm>({
        screen: 0,
        picture: 0,
        sound: 0,
        seat: 0,
        comment: "",
    });

    const [reviewEditorOpen, setReviewEditorOpen] = useState(true);
    const [reviewEditorTouched, setReviewEditorTouched] = useState(false);

    const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
    const [likeBusy, setLikeBusy] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    // load cinema
    useEffect(() => {
        let alive = true;
        const load = async () => {
            const ref = doc(db, "cinema", cinemaId);
            const snap = await getDoc(ref);
            if (!snap.exists()) return;

            const raw = snap.data() as Record<string, unknown>;
            const c: Theater = {
                id: snap.id,
                name: String(raw.name ?? ""),
                address: String(raw.address ?? ""),
                lat: Number(raw.lat),
                lng: Number(raw.lng),
                tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
            };

            if (!alive) return;
            setCinema(c);
            setSelectedTag(c.tags?.[0] ?? null);
            setSortMode("latest");
        };

        if (cinemaId) void load();
        return () => {
            alive = false;
        };
    }, [cinemaId]);

    // check favorite
    useEffect(() => {
        let alive = true;
        const run = async () => {
            const favRef = doc(db, "users", user.uid, "favorites", cinemaId);
            const s = await getDoc(favRef);
            if (!alive) return;
            setIsFavorite(s.exists());
        };
        if (cinemaId) void run();
        return () => {
            alive = false;
        };
    }, [cinemaId, user.uid]);

    const toggleFavorite = async () => {
        if (!cinemaId) return;
        setFavBusy(true);
        try {
            const favRef = doc(db, "users", user.uid, "favorites", cinemaId);
            const snap = await getDoc(favRef);
            if (snap.exists()) {
                await deleteDoc(favRef);
                setIsFavorite(false);
            } else {
                await setDoc(favRef, { cinemaId, createdAt: serverTimestamp() }, { merge: true });
                setIsFavorite(true);
            }
        } finally {
            setFavBusy(false);
        }
    };

    // reviews subscribe
    useEffect(() => {
        if (!user || !cinemaId || !selectedTag) {
            setReviews([]);
            setReviewLoadError(null);
            setLikedMap({});
            return;
        }

        setReviewLoadError(null);

        const reviewsRef = collection(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews");
        const q =
            sortMode === "likes"
                ? query(reviewsRef, orderBy("likeCount", "desc"), orderBy("updatedAt", "desc"))
                : query(reviewsRef, orderBy("updatedAt", "desc"));

        const unsub = onSnapshot(
            q,
            (snap) => {
                const list: Review[] = snap.docs.map((d) => {
                    const raw = d.data() as Record<string, unknown>;
                    return {
                        id: d.id,
                        userId: String(raw.userId ?? d.id),
                        displayName: String(raw.displayName ?? ""),
                        screen: Number(raw.screen ?? 0),
                        picture: Number(raw.picture ?? 0),
                        sound: Number(raw.sound ?? 0),
                        seat: Number(raw.seat ?? 0),
                        comment: String(raw.comment ?? ""),
                        likeCount: Number(raw.likeCount ?? 0),
                    };
                });

                setReviews(list);

                const mine = list.find((r) => r.id === user.uid);
                if (mine) {
                    setMyReview({
                        screen: mine.screen,
                        picture: mine.picture,
                        sound: mine.sound,
                        seat: mine.seat,
                        comment: mine.comment,
                    });
                    if (!reviewEditorTouched) setReviewEditorOpen(false);
                } else {
                    setMyReview({ screen: 0, picture: 0, sound: 0, seat: 0, comment: "" });
                    if (!reviewEditorTouched) setReviewEditorOpen(true);
                }

                // liked map
                void (async () => {
                    const pairs = await Promise.all(
                        list.map(async (r) => {
                            const likeRef = doc(
                                db,
                                "cinema",
                                cinemaId,
                                "tagReviews",
                                selectedTag,
                                "reviews",
                                r.id,
                                "likes",
                                user.uid
                            );
                            const likeSnap = await getDoc(likeRef);
                            return [r.id, likeSnap.exists()] as const;
                        })
                    );
                    const next: Record<string, boolean> = {};
                    for (const [rid, liked] of pairs) next[rid] = liked;
                    setLikedMap(next);
                })();
            },
            (err) => {
                setReviews([]);
                setLikedMap({});
                setReviewLoadError(err?.message || "리뷰를 불러오지 못했습니다.");
            }
        );

        return () => unsub();
    }, [user, cinemaId, selectedTag, sortMode, reviewEditorTouched]);

    const saveMyReview = async () => {
        if (!selectedTag) return;
        setSavingReview(true);
        setError(null);

        const reviewRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", user.uid);
        const statsRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "stats", "summary");

        const newOverall = (myReview.screen + myReview.picture + myReview.sound + myReview.seat) / 4;

        try {
            await runTransaction(db, async (tx) => {
                const reviewSnap = await tx.get(reviewRef);
                const statsSnap = await tx.get(statsRef);

                let oldOverall: number | null = null;
                if (reviewSnap.exists()) {
                    const prev = reviewSnap.data() as any;
                    oldOverall =
                        prev.overall !== undefined
                            ? Number(prev.overall)
                            : (Number(prev.screen ?? 0) +
                                Number(prev.picture ?? 0) +
                                Number(prev.sound ?? 0) +
                                Number(prev.seat ?? 0)) /
                            4;
                }
                const existingLikeCount = reviewSnap.exists()
                    ? Number((reviewSnap.data() as any).likeCount ?? 0)
                    : 0;

                const baseReview = {
                    userId: user.uid,
                    displayName: user.displayName ?? user.email ?? "",
                    screen: myReview.screen,
                    picture: myReview.picture,
                    sound: myReview.sound,
                    seat: myReview.seat,
                    overall: newOverall,
                    comment: myReview.comment,
                    updatedAt: serverTimestamp(),
                    likeCount: existingLikeCount,
                };

                if (!reviewSnap.exists()) {
                    tx.set(
                        reviewRef,
                        {
                            ...baseReview,
                            likeCount: 0,
                            createdAt: serverTimestamp(),
                        },
                        { merge: true }
                    );
                } else {
                    tx.set(reviewRef, baseReview, { merge: true });
                }

                const stats = statsSnap.exists() ? (statsSnap.data() as any) : { count: 0, sumOverall: 0 };
                let count = Number(stats.count ?? 0);
                let sumOverall = Number(stats.sumOverall ?? 0);

                if (oldOverall === null) {
                    count += 1;
                    sumOverall += newOverall;
                } else {
                    sumOverall += newOverall - oldOverall;
                }

                const avgOverall = count === 0 ? 0 : sumOverall / count;

                tx.set(statsRef, { count, sumOverall, avgOverall, updatedAt: serverTimestamp() }, { merge: true });
            });

            setReviewEditorTouched(true);
            setReviewEditorOpen(false);
        } catch (e) {
            setError(String(e));
        } finally {
            setSavingReview(false);
        }
    };

    const deleteMyReview = async () => {
        if (!selectedTag) return;

        Alert.alert("내 리뷰 삭제", "정말 삭제할까요?", [
            { text: "취소", style: "cancel" },
            {
                text: "삭제",
                style: "destructive",
                onPress: async () => {
                    setError(null);
                    setSavingReview(true);

                    const reviewRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", user.uid);
                    const statsRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "stats", "summary");

                    try {
                        await runTransaction(db, async (tx) => {
                            const reviewSnap = await tx.get(reviewRef);
                            if (!reviewSnap.exists()) return;

                            const prev = reviewSnap.data() as any;
                            const oldOverall =
                                prev.overall !== undefined
                                    ? Number(prev.overall)
                                    : (Number(prev.screen ?? 0) +
                                        Number(prev.picture ?? 0) +
                                        Number(prev.sound ?? 0) +
                                        Number(prev.seat ?? 0)) /
                                    4;

                            const statsSnap = await tx.get(statsRef);
                            const stats = statsSnap.exists() ? (statsSnap.data() as any) : { count: 0, sumOverall: 0 };

                            let count = Number(stats.count ?? 0);
                            let sumOverall = Number(stats.sumOverall ?? 0);

                            tx.delete(reviewRef);

                            count = Math.max(0, count - 1);
                            sumOverall = sumOverall - oldOverall;
                            if (count === 0) sumOverall = 0;

                            const avgOverall = count === 0 ? 0 : sumOverall / count;

                            tx.set(statsRef, { count, sumOverall, avgOverall, updatedAt: serverTimestamp() }, { merge: true });
                        });

                        setMyReview({ screen: 0, picture: 0, sound: 0, seat: 0, comment: "" });
                        setReviewEditorTouched(true);
                        setReviewEditorOpen(true);
                    } catch (e) {
                        setError(String(e));
                    } finally {
                        setSavingReview(false);
                    }
                },
            },
        ]);
    };

    const toggleLike = async (reviewId: string) => {
        if (!selectedTag) return;

        if (likeBusy[reviewId]) return;
        setLikeBusy((m) => ({ ...m, [reviewId]: true }));
        setError(null);

        const reviewRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", reviewId);
        const likeRef = doc(db, "cinema", cinemaId, "tagReviews", selectedTag, "reviews", reviewId, "likes", user.uid);

        try {
            await runTransaction(db, async (tx) => {
                const likeSnap = await tx.get(likeRef);
                const reviewSnap = await tx.get(reviewRef);

                const currentLike = reviewSnap.exists() ? Number((reviewSnap.data() as any).likeCount ?? 0) : 0;

                if (likeSnap.exists()) {
                    const nextLike = Math.max(0, currentLike - 1);
                    tx.delete(likeRef);
                    tx.set(reviewRef, { likeCount: nextLike }, { merge: true });
                } else {
                    const nextLike = currentLike + 1;
                    tx.set(likeRef, { createdAt: serverTimestamp() }, { merge: true });
                    tx.set(reviewRef, { likeCount: nextLike }, { merge: true });
                }
            });

            setLikedMap((m) => ({ ...m, [reviewId]: !m[reviewId] }));
        } catch (e) {
            setError(String(e));
        } finally {
            setLikeBusy((m) => ({ ...m, [reviewId]: false }));
        }
    };

    const overallScore = (r: { screen: number; picture: number; sound: number; seat: number }) =>
        (r.screen + r.picture + r.sound + r.seat) / 4;

    const tagStats = useMemo(() => {
        if (!selectedTag) return null;
        if (reviews.length === 0) return { count: 0, avgOverall: 0 };
        const n = reviews.length;
        const avgOverall = reviews.reduce((acc, r) => acc + overallScore(r), 0) / n;
        return { count: n, avgOverall };
    }, [reviews, selectedTag]);

    // pagination (reviews)
    useEffect(() => {
        setPage(1);
    }, [selectedTag, sortMode]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(reviews.length / PAGE_SIZE)), [reviews.length]);

    const pagedReviews = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return reviews.slice(start, start + PAGE_SIZE);
    }, [reviews, page]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    if (!cinema) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
                <Text style={styles.muted}>로딩중...</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {/* Top bar */}
            <View style={styles.card}>
                <View style={styles.row}>
                    <TouchableOpacity style={styles.pill} onPress={() => navigation.goBack()}>
                        <Text style={styles.pillText}>← 뒤로</Text>
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                        <Text style={styles.title}>{cinema.name}</Text>
                        <Text style={styles.muted}>{cinema.address}</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.btn, styles.btnPrimary]}
                        onPress={toggleFavorite}
                        disabled={favBusy}
                    >
                        <Text style={styles.btnText}>
                            {favBusy ? "처리 중..." : isFavorite ? "💔️ 관심 해제" : "❤️ 관심 등록"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Tag */}
            <View style={styles.card}>
                <View style={styles.row}>
                    <Text style={styles.sectionTitle}>특별 상영관</Text>
                    <Text style={styles.muted}>{selectedTag ? `현재 태그: ${selectedTag}` : ""}</Text>
                </View>

                <View style={styles.wrap}>
                    {(cinema.tags ?? []).map((tag) => {
                        const active = selectedTag === tag;
                        return (
                            <TouchableOpacity
                                key={tag}
                                style={[styles.btn, active && styles.btnActive]}
                                onPress={() => setSelectedTag(tag)}
                            >
                                <Text style={styles.btnText}>{tag}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* Summary */}
            {selectedTag && tagStats && (
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.sectionTitle}>상영관 평점</Text>
                        <Text style={styles.muted}>
                            평균 <Text style={styles.bold}>{tagStats.avgOverall.toFixed(1)}</Text> / 5.0 · {tagStats.count}명
                        </Text>
                    </View>
                    <Text style={[styles.muted, { marginTop: 6 }]}>(크기 + 화질 + 사운드 + 좌석)</Text>
                </View>
            )}

            {/* My review */}
            {selectedTag && (
                <View style={styles.card}>
                    <View style={styles.row}>
                        <Text style={styles.sectionTitle}>내 리뷰</Text>
                        <TouchableOpacity
                            style={styles.btn}
                            onPress={() => {
                                setReviewEditorTouched(true);
                                setReviewEditorOpen((v) => !v);
                            }}
                        >
                            <Text style={styles.btnText}>{reviewEditorOpen ? "접기" : "리뷰 작성/수정"}</Text>
                        </TouchableOpacity>
                    </View>

                    {!reviewEditorOpen ? (
                        <View style={{ marginTop: 10 }}>
                            <Text style={styles.muted}>
                                내 평점: 크기 {myReview.screen.toFixed(1)} · 화질 {myReview.picture.toFixed(1)} · 사운드{" "}
                                {myReview.sound.toFixed(1)} · 좌석 {myReview.seat.toFixed(1)}
                            </Text>
                            <Text style={{ marginTop: 10, color: "#fff" }}>
                                {myReview.comment ? `댓글: ${myReview.comment}` : "댓글: (없음)"}
                            </Text>
                        </View>
                    ) : (
                        <View style={{ marginTop: 10, gap: 14 }}>
                            <RatingSlider
                                label="크기"
                                value={myReview.screen}
                                onChange={(v) => setMyReview((p) => ({ ...p, screen: v }))}
                            />
                            <RatingSlider
                                label="화질"
                                value={myReview.picture}
                                onChange={(v) => setMyReview((p) => ({ ...p, picture: v }))}
                            />
                            <RatingSlider
                                label="사운드"
                                value={myReview.sound}
                                onChange={(v) => setMyReview((p) => ({ ...p, sound: v }))}
                            />
                            <RatingSlider
                                label="좌석"
                                value={myReview.seat}
                                onChange={(v) => setMyReview((p) => ({ ...p, seat: v }))}
                            />

                            <TextInput
                                value={myReview.comment}
                                onChangeText={(t) => setMyReview((p) => ({ ...p, comment: t }))}
                                placeholder="리뷰 코멘트를 남겨주세요"
                                placeholderTextColor="rgba(255,255,255,0.55)"
                                style={styles.textarea}
                                multiline
                            />

                            <View style={[styles.row, { justifyContent: "space-between" }]}>
                                <TouchableOpacity
                                    style={[styles.btn, styles.btnPrimary]}
                                    onPress={saveMyReview}
                                    disabled={savingReview}
                                >
                                    <Text style={styles.btnText}>{savingReview ? "저장 중..." : "내 리뷰 저장"}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={deleteMyReview} disabled={savingReview}>
                                    <Text style={styles.btnText}>내 리뷰 삭제</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.muted}>저장하면 랭킹/통계에 반영됩니다</Text>
                        </View>
                    )}
                </View>
            )}

            {/* Review list */}
            <View style={styles.card}>
                <View style={styles.row}>
                    <Text style={styles.sectionTitle}>전체 리뷰</Text>

                    {!!selectedTag && (
                        <View style={{ flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity
                                style={[styles.btn, sortMode === "latest" && styles.btnActive]}
                                onPress={() => setSortMode("latest")}
                            >
                                <Text style={styles.btnText}>최신순</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.btn, sortMode === "likes" && styles.btnActive]}
                                onPress={() => setSortMode("likes")}
                            >
                                <Text style={styles.btnText}>좋아요순</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Text style={[styles.muted, { marginLeft: "auto" }]}>{reviews.length}개</Text>
                </View>

                {!!reviewLoadError && <Text style={styles.err}>{reviewLoadError}</Text>}
                {!!error && <Text style={styles.err}>{error}</Text>}

                <View style={{ marginTop: 12, gap: 10 }}>
                    {pagedReviews.map((r) => {
                        const liked = !!likedMap[r.id];
                        const busy = !!likeBusy[r.id];

                        return (
                            <View key={r.id} style={styles.subCard}>
                                <View style={styles.row}>
                                    <Text style={styles.bold}>{r.displayName || r.userId}</Text>

                                    <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 10 }}>
                                        <View style={styles.pill}>
                                            <Text style={styles.pillText}>❤️ {r.likeCount}</Text>
                                        </View>

                                        <TouchableOpacity style={styles.btn} onPress={() => toggleLike(r.id)} disabled={busy}>
                                            <Text style={styles.btnText}>{busy ? "..." : liked ? "좋아요 취소" : "좋아요"}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <Text style={[styles.muted, { marginTop: 8 }]}>
                                    크기 {r.screen.toFixed(1)} · 화질 {r.picture.toFixed(1)} · 사운드 {r.sound.toFixed(1)} · 좌석{" "}
                                    {r.seat.toFixed(1)} · 평균 <Text style={styles.bold}>{overallScore(r).toFixed(1)}</Text>
                                </Text>

                                {!!r.comment && <Text style={{ marginTop: 10, color: "rgba(255,255,255,0.92)" }}>{r.comment}</Text>}
                            </View>
                        );
                    })}
                </View>

                {reviews.length > PAGE_SIZE && (
                    <View style={[styles.row, { justifyContent: "center", marginTop: 14, gap: 12 }]}>
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
            </View>
        </ScrollView>
    );
}

function RatingSlider({
                          label,
                          value,
                          onChange,
                      }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <View>
            <Text style={styles.muted}>
                {label} <Text style={styles.bold}>{value.toFixed(1)}</Text>
            </Text>
            <Slider
                minimumValue={0}
                maximumValue={5}
                step={0.5}
                value={value}
                onValueChange={onChange}
                minimumTrackTintColor="#6fd3ff"
                maximumTrackTintColor="rgba(255,255,255,0.25)"
                thumbTintColor="#dbeafe"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 10,
    },

    container: { padding: 14, paddingBottom: 40, gap: 12, backgroundColor: "#05060f" },

    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#05060f" },

    card: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderColor: "rgba(255,255,255,0.14)",
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
    },

    subCard: {
        backgroundColor: "rgba(255,255,255,0.04)",
        borderColor: "rgba(255,255,255,0.12)",
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
    },

    row: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },

    title: { color: "rgba(255,255,255,0.92)", fontSize: 18, fontWeight: "800" },
    sectionTitle: { color: "rgba(255,255,255,0.92)", fontSize: 16, fontWeight: "800" },
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
    btnPrimary: {
        borderColor: "rgba(111,211,255,0.30)",
        backgroundColor: "rgba(111,211,255,0.10)",
    },
    btnDanger: { borderColor: "rgba(248,113,113,0.45)" },
    btnActive: { borderColor: "rgba(242,208,122,0.32)", backgroundColor: "rgba(242,208,122,0.10)" },

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

    textarea: {
        borderColor: "rgba(255,255,255,0.18)",
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        minHeight: 90,
        color: "rgba(255,255,255,0.92)",
        backgroundColor: "rgba(0,0,0,0.26)",
    },

    err: {
        marginTop: 10,
        color: "#fca5a5",
        fontSize: 12,
    },
});