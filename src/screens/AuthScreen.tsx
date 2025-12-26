import React, { useEffect, useMemo, useRef, useState } from "react";
// LoginScreen.tsx 상단
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AuthSession from "expo-auth-session";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";


import {
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    deleteUser,
} from "firebase/auth";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

WebBrowser.maybeCompleteAuthSession();

type Props = {
    // 로그인 성공 후, 상위(App.tsx)가 onAuthStateChanged로 화면 전환하므로 없어도 됨
    onSwitchMode?: (mode: "login" | "signup") => void;
};

export default function AuthScreen({ onSwitchMode }: Props) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const [isSignUp, setIsSignUp] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [nickname, setNickname] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);


// ...

    const redirectUri = "https://auth.expo.io/@gangsuckmin/pb-mobile";

    const [request, response, promptAsync] = Google.useAuthRequest({
        clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, // 웹 클라이언트 ID
        redirectUri,
    });
// response가 오면 Firebase로 로그인 완료
    useEffect(() => {
        const run = async () => {
            if (!response) return;

            if (response.type === "success") {
                const idToken = response.authentication?.idToken;
                if (!idToken) {
                    setError("Google 로그인 토큰(idToken)을 받지 못했습니다.");
                    return;
                }
                try {
                    setError(null);
                    setBusy(true);
                    const cred = GoogleAuthProvider.credential(idToken);
                    await signInWithCredential(auth, cred);
                    // 성공하면 App.tsx onAuthStateChanged가 화면 전환
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setError(msg);
                } finally {
                    setBusy(false);
                }
            } else if (response.type === "error") {
                setError("Google 로그인에 실패했습니다. (OAuth 설정/리다이렉트 확인)");
            }
        };

        void run();
    }, [response]);

    // 웹의 key={authModeKey} 느낌의 “전환 애니메이션”
    const fade = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        fade.setValue(0);
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }, [isSignUp, fade]);

    const authModeKey = isSignUp ? "signup" : "login";

    // 웹과 동일: 닉네임 중복키는 lower()로
    const nickKeyOf = (nick: string) => nick.trim().toLowerCase();

    const canSubmit = useMemo(() => {
        if (!email.trim()) return false;
        if (!password) return false;
        if (isSignUp) {
            const nick = nickname.trim();
            if (!nick) return false;
            if (nick.length < 2) return false;
            if (passwordConfirm !== password) return false;
        }
        return true;
    }, [email, password, isSignUp, nickname, passwordConfirm]);

    const handleEmailAuth = async () => {
        if (busy) return;

        try {
            setError(null);
            setBusy(true);

            if (isSignUp) {
                const nick = nickname.trim();
                if (!nick) {
                    setError("닉네임을 입력해주세요.");
                    return;
                }
                if (nick.length < 2) {
                    setError("닉네임은 2글자 이상으로 입력해주세요.");
                    return;
                }
                if (passwordConfirm !== password) {
                    setError("비밀번호가 일치하지 않습니다.");
                    return;
                }

                // 1) Auth 계정 생성
                const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);

                // 2) 닉네임 중복 방지: nicknames/{nicknameLower} 문서로 예약
                const nickKey = nickKeyOf(nick);
                const nickRef = doc(db, "nicknames", nickKey);
                const userRef = doc(db, "users", cred.user.uid);

                try {
                    await runTransaction(db, async (tx) => {
                        const nickSnap = await tx.get(nickRef);
                        if (nickSnap.exists()) {
                            throw new Error("이미 사용 중인 닉네임입니다.");
                        }

                        tx.set(nickRef, {
                            uid: cred.user.uid,
                            nickname: nick,
                            createdAt: serverTimestamp(),
                        });

                        tx.set(
                            userRef,
                            {
                                uid: cred.user.uid,
                                email: cred.user.email ?? email.trim(),
                                nickname: nick,
                                createdAt: serverTimestamp(),
                            },
                            { merge: true }
                        );
                    });
                } catch (e) {
                    // 트랜잭션 실패(닉네임 중복 등) 시 Auth 계정도 롤백
                    try {
                        await deleteUser(cred.user);
                    } catch {
                        // 무시
                    }
                    throw e;
                }

                // 3) Auth displayName 저장 (리뷰에서 user.displayName으로 사용)
                await updateProfile(cred.user, { displayName: nick });
            } else {
                await signInWithEmailAndPassword(auth, email.trim(), password);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    const toggleMode = () => {
        setError(null);
        setPasswordConfirm("");
        setNickname("");
        setIsSignUp((v) => {
            const next = !v;
            onSwitchMode?.(next ? "signup" : "login");
            return next;
        });
    };

    return (
        <KeyboardAvoidingView
            style={styles.bg}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <View style={styles.container}>
                <View style={styles.card}>
                    {/* brand */}
                    <View style={styles.brandRow}>
                        <Text style={styles.brand}>Your Special Cinema</Text>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>너를 위한 특별 영화관 리스트</Text>
                        </View>
                    </View>

                    <Animated.View key={authModeKey} style={{ opacity: fade }}>
                        <Text style={styles.modeTitle}>{isSignUp ? "회원가입" : "로그인"}</Text>

                        <TextInput
                            style={styles.input}
                            placeholder="email"
                            placeholderTextColor="rgba(255,255,255,.45)"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            value={email}
                            onChangeText={setEmail}
                        />

                        <TextInput
                            style={styles.input}
                            placeholder="password"
                            placeholderTextColor="rgba(255,255,255,.45)"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                        />

                        {isSignUp && (
                            <TextInput
                                style={styles.input}
                                placeholder="confirm password"
                                placeholderTextColor="rgba(255,255,255,.45)"
                                secureTextEntry
                                value={passwordConfirm}
                                onChangeText={setPasswordConfirm}
                            />
                        )}

                        {isSignUp && (
                            <TextInput
                                style={styles.input}
                                placeholder="nickname"
                                placeholderTextColor="rgba(255,255,255,.45)"
                                value={nickname}
                                onChangeText={setNickname}
                            />
                        )}

                        {error ? <Text style={styles.err}>{error}</Text> : null}

                        <View style={styles.btnRow}>
                            <Pressable
                                style={[styles.btn, styles.btnPrimary, (!canSubmit || busy) && styles.btnDisabled]}
                                disabled={!canSubmit || busy}
                                onPress={handleEmailAuth}
                            >
                                {busy ? (
                                    <ActivityIndicator />
                                ) : (
                                    <Text style={styles.btnText}>{isSignUp ? "회원가입" : "로그인"}</Text>
                                )}
                            </Pressable>

                            <Pressable style={[styles.btn, styles.btnGhost]} onPress={toggleMode} disabled={busy}>
                                <Text style={styles.btnText}>
                                    {isSignUp ? "로그인으로 전환" : "회원가입으로 전환"}
                                </Text>
                            </Pressable>

                            {/* 웹의 Google 로그인 버튼 모양만 유지 (RN은 Popup 불가) */}
                            <Pressable
                                style={[styles.btn, styles.btnGhost]}
                                onPress={() => {
                                    setError(null);
                                    void promptAsync(); // 여기엔 useProxy 넣지 마 (TS 에러났던 이유)
                                }}
                                disabled={!request || busy}
                            >
                                <Text style={styles.btnText}>Google 로그인</Text>
                            </Pressable>
                        </View>
                    </Animated.View>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    bg: {
        flex: 1,
        backgroundColor: "#05060f",
    },
    container: {
        flex: 1,
        justifyContent: "center",
        padding: 18,
    },
    card: {
        borderRadius: 16,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,.14)",
        backgroundColor: "rgba(255,255,255,.06)",
    },
    brandRow: {
        marginBottom: 18,
        gap: 10,
    },
    brand: {
        color: "rgba(255,255,255,.92)",
        fontSize: 22,
        fontWeight: "800",
        letterSpacing: 0.3,
    },
    badge: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(111,211,255,.25)",
        backgroundColor: "rgba(111,211,255,.07)",
    },
    badgeText: {
        color: "rgba(255,255,255,.88)",
        fontSize: 12,
        fontWeight: "600",
    },
    modeTitle: {
        color: "rgba(255,255,255,.65)",
        fontSize: 15,
        marginBottom: 10,
    },
    input: {
        width: "100%",
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        marginTop: 10,
        color: "rgba(255,255,255,.92)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,.18)",
        backgroundColor: "rgba(0,0,0,.26)",
    },
    err: {
        marginTop: 10,
        color: "#fca5a5",
        fontSize: 12,
    },
    btnRow: {
        marginTop: 14,
        gap: 10,
    },
    btn: {
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,.16)",
        backgroundColor: "rgba(255,255,255,.045)",
        alignItems: "center",
    },
    btnPrimary: {
        borderColor: "rgba(111,211,255,.30)",
        backgroundColor: "rgba(111,211,255,.12)",
    },
    btnGhost: {},
    btnDisabled: {
        opacity: 0.55,
    },
    btnText: {
        color: "rgba(255,255,255,.92)",
        fontWeight: "700",
    },
});