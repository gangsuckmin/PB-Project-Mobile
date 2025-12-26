import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import type { User } from "firebase/auth";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";

type Theater = {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    tags?: string[];
    brand?: "CGV" | "롯데시네마" | "메가박스" | "기타";
    region?: "서울" | "경기" | "충청" | "전라" | "강원" | "경상" | "기타";
};

const inferBrand = (name: string): Theater["brand"] => {
    const n = name.toLowerCase();
    if (n.includes("cgv")) return "CGV";
    if (n.includes("롯데") || n.includes("lotte")) return "롯데시네마";
    if (n.includes("메가") || n.includes("mega")) return "메가박스";
    return "기타";
};

const inferRegion = (address: string): Theater["region"] => {
    const a = address.trim();
    if (a.startsWith("서울")) return "서울";
    if (a.startsWith("경기") || a.startsWith("인천")) return "경기";
    if (a.startsWith("충북") || a.startsWith("충남") || a.startsWith("대전") || a.startsWith("세종")) return "충청";
    if (a.startsWith("전북") || a.startsWith("전남") || a.startsWith("광주")) return "전라";
    if (a.startsWith("강원")) return "강원";
    if (
        a.startsWith("경북") ||
        a.startsWith("경남") ||
        a.startsWith("부산") ||
        a.startsWith("대구") ||
        a.startsWith("울산")
    ) return "경상";
    return "기타";
};

type Props = {
    user: User;
};

type BrandFilter = "ALL" | NonNullable<Theater["brand"]>;
type RegionFilter = "ALL" | NonNullable<Theater["region"]>;

const BRAND_OPTIONS: { value: BrandFilter; label: string }[] = [
    { value: "ALL", label: "전체" },
    { value: "CGV", label: "CGV" },
    { value: "롯데시네마", label: "롯데시네마" },
    { value: "메가박스", label: "메가박스" },
    { value: "기타", label: "기타" },
];

const REGION_OPTIONS: { value: RegionFilter; label: string }[] = [
    { value: "ALL", label: "전체" },
    { value: "서울", label: "서울시" },
    { value: "경기", label: "경기도" },
    { value: "충청", label: "충청도" },
    { value: "전라", label: "전라도" },
    { value: "강원", label: "강원도" },
    { value: "경상", label: "경상도" },
    // 웹 코드에 "제주도"가 "경상" value로 들어가 있었는데, 모바일도 “동작 동일”하게 두려면 그대로 두면 됨.
    // (정상이라면 value를 "기타"로 하거나 region 타입에 "제주"를 추가해야 함)
    { value: "경상", label: "제주도" },
    { value: "기타", label: "기타" },
];

export default function AllCinemasScreen({ user }: Props) {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [theaters, setTheaters] = useState<Theater[]>([]);
    const [loading, setLoading] = useState(true);

    const [brandFilter, setBrandFilter] = useState<BrandFilter>("ALL");
    const [regionFilter, setRegionFilter] = useState<RegionFilter>("ALL");

    const PAGE_SIZE = 3;
    const [page, setPage] = useState(1);

    useEffect(() => {
        let alive = true;

        const load = async () => {
            setLoading(true);
            const snap = await getDocs(collection(db, "cinema"));

            const list: Theater[] = snap.docs.map((d) => {
                const raw = d.data() as Record<string, unknown>;
                const name = String(raw.name ?? "");
                const address = String(raw.address ?? "");
                const brandRaw = raw.brand as unknown;
                const regionRaw = raw.region as unknown;

                const brand: Theater["brand"] =
                    brandRaw === "CGV" || brandRaw === "롯데시네마" || brandRaw === "메가박스" || brandRaw === "기타"
                        ? (brandRaw as Theater["brand"])
                        : inferBrand(name);

                const region: Theater["region"] =
                    regionRaw === "서울" ||
                    regionRaw === "경기" ||
                    regionRaw === "충청" ||
                    regionRaw === "전라" ||
                    regionRaw === "강원" ||
                    regionRaw === "경상" ||
                    regionRaw === "기타"
                        ? (regionRaw as Theater["region"])
                        : inferRegion(address);

                return {
                    id: d.id,
                    name,
                    address,
                    lat: Number(raw.lat),
                    lng: Number(raw.lng),
                    tags: Array.isArray(raw.tags) ? raw.tags.map((v) => String(v)) : undefined,
                    brand,
                    region,
                };
            });

            if (!alive) return;
            setTheaters(list);
            setLoading(false);
        };

        void load();

        return () => {
            alive = false;
        };
    }, [user.uid]);

    const filtered = useMemo(() => {
        return theaters.filter((t) => {
            const okBrand = brandFilter === "ALL" ? true : (t.brand ?? "기타") === brandFilter;
            const okRegion = regionFilter === "ALL" ? true : (t.region ?? "기타") === regionFilter;
            return okBrand && okRegion;
        });
    }, [theaters, brandFilter, regionFilter]);

    // filters 바뀌면 1페이지로
    useEffect(() => {
        setPage(1);
    }, [brandFilter, regionFilter]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), [filtered.length]);

    const paged = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;
        return filtered.slice(start, start + PAGE_SIZE);
    }, [filtered, page]);

    // filtered가 줄어들어 페이지가 범위를 벗어나면 보정
    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const resetFilters = () => {
        setBrandFilter("ALL");
        setRegionFilter("ALL");
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
            {/* Filter card */}
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>특별 영화관 검색</Text>
                    <Text style={styles.muted}>{filtered.length}개</Text>
                </View>

                {/* brand */}
                <Text style={[styles.muted, { marginTop: 12 }]}>체인</Text>
                <View style={styles.chipWrap}>
                    {BRAND_OPTIONS.map((opt) => {
                        const active = brandFilter === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.label}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => setBrandFilter(opt.value)}
                            >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* region */}
                <Text style={[styles.muted, { marginTop: 10 }]}>지역</Text>
                <View style={styles.chipWrap}>
                    {REGION_OPTIONS.map((opt, idx) => {
                        const key = `${opt.label}-${idx}`;
                        const active = regionFilter === opt.value;
                        return (
                            <TouchableOpacity
                                key={key}
                                style={[styles.chip, active && styles.chipActive]}
                                onPress={() => setRegionFilter(opt.value)}
                            >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity style={[styles.btn, { marginTop: 12, alignSelf: "flex-end" }]} onPress={resetFilters}>
                    <Text style={styles.btnText}>초기화</Text>
                </TouchableOpacity>
            </View>

            {/* list */}
            <View style={{ gap: 12, marginTop: 12 }}>
                {paged.map((t) => (
                    <View key={t.id} style={styles.card}>
                        <View style={styles.headerRow}>
                            <Text style={styles.bold}>{t.name}</Text>
                            <Text style={styles.muted}>
                                {(t.brand ?? "기타")} · {(t.region ?? "기타")}
                            </Text>
                        </View>

                        <Text style={[styles.muted, { marginTop: 6 }]}>{t.address}</Text>

                        {!!t.tags?.length && (
                            <Text style={[styles.muted, { marginTop: 6 }]}>특별 상영관: {t.tags.join(", ")}</Text>
                        )}

                        <TouchableOpacity
                            style={[styles.pill, { marginTop: 10, alignSelf: "flex-start" }]}
                            onPress={() => navigation.navigate("CinemaDetail", { cinemaId: t.id })}
                        >
                            <Text style={styles.pillText}>상세 보기</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>

            {/* pager */}
            {filtered.length > PAGE_SIZE && (
                <View style={[styles.card, styles.pager]}>
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

            <Text style={[styles.muted, { marginTop: 10 }]}>
                ※ brand/region 필드가 없으면 이름/주소로 추정합니다.
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 14, paddingBottom: 40, backgroundColor: "#05060f" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#05060f" },

    card: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderColor: "rgba(255,255,255,0.14)",
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
    },

    headerRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },

    title: { color: "rgba(255,255,255,0.92)", fontSize: 18, fontWeight: "800" },
    bold: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 16 },
    muted: { color: "rgba(255,255,255,0.65)", fontSize: 12 },

    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        backgroundColor: "rgba(255,255,255,0.04)",
    },
    chipActive: {
        borderColor: "rgba(242,208,122,0.32)",
        backgroundColor: "rgba(242,208,122,0.10)",
    },
    chipText: { color: "rgba(255,255,255,0.80)", fontSize: 12, fontWeight: "700" },
    chipTextActive: { color: "rgba(255,255,255,0.92)" },

    btn: {
        backgroundColor: "rgba(255,255,255,0.05)",
        borderColor: "rgba(255,255,255,0.16)",
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
    },
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

    pager: { marginTop: 12, flexDirection: "row", gap: 10, justifyContent: "center", alignItems: "center" },
});