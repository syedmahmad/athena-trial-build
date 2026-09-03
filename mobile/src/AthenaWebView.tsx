import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { APP_UA_TAG, SUPABASE_URL, WEB_URL, hasNativeAuthConfig } from "./config";
import { signInWithGoogleNative } from "./nativeOAuth";

const NAVY = "#132139";
const AMBER = "#e89d00";

type WebViewProps = React.ComponentProps<typeof WebView>;
type MessageEvent = Parameters<NonNullable<WebViewProps["onMessage"]>>[0];
type NavStateChange = NonNullable<WebViewProps["onNavigationStateChange"]>;
type ShouldStart = NonNullable<WebViewProps["onShouldStartLoadWithRequest"]>;
type OpenWindow = NonNullable<WebViewProps["onOpenWindow"]>;

// Set before any page script runs, on every navigation, so the web app can
// detect the shell from its very first render.
const INJECTED_BEFORE_LOAD = `
  window.__ATHENA_NATIVE__ = true;
  window.__ATHENA_NATIVE_VERSION__ = "1.0.0";
  true;
`;

/** Hosts that must render INSIDE the WebView (redirects would break otherwise). */
function hostname(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}
const WEB_HOST = hostname(WEB_URL);
const SUPABASE_HOST = hostname(SUPABASE_URL);

function stayInWebView(url: string): boolean {
  const host = hostname(url);
  if (!host) return false;
  if (host === WEB_HOST) return true;
  // Supabase auth endpoints (magic-link / recovery callbacks, captcha).
  if (SUPABASE_HOST && host === SUPABASE_HOST) return true;
  // Stripe Checkout + 3-D Secure must stay in-app so the return redirect lands
  // back on the web app inside the WebView.
  if (host === "checkout.stripe.com" || host.endsWith(".stripe.com")) return true;
  return false;
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

/** Same-origin relative path only; rejects `//host` / `/\host` open redirects. */
function safeNextPath(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
    ? value
    : "/dashboard";
}

export function AthenaWebView({ onReady }: { onReady?: () => void }) {
  const webRef = useRef<WebView>(null);
  const readyFired = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [errored, setErrored] = useState(false);

  const injectSetSession = useCallback(
    (accessToken: string, refreshToken: string, next: string) => {
      webRef.current?.injectJavaScript(
        `(function(){try{if(window.__athenaSetSession){window.__athenaSetSession(${jsString(
          accessToken
        )},${jsString(refreshToken)},${jsString(next)});}}catch(e){}})();true;`
      );
    },
    []
  );

  const injectAuthResult = useCallback((ok: boolean, message: string | null) => {
    webRef.current?.injectJavaScript(
      `(function(){try{if(window.__athenaOnAuthResult){window.__athenaOnAuthResult(${
        ok ? "true" : "false"
      },${message == null ? "null" : jsString(message)});}}catch(e){}})();true;`
    );
  }, []);

  const onMessage = useCallback(
    async (event: MessageEvent) => {
      let msg: unknown;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object") return;
      const data = msg as { type?: unknown; next?: unknown };

      if (data.type === "google-oauth") {
        const next = safeNextPath(data.next);
        if (!hasNativeAuthConfig) {
          injectAuthResult(false, "Google sign-in isn’t configured in this build.");
          return;
        }
        try {
          const result = await signInWithGoogleNative();
          if (result.ok) {
            injectSetSession(result.accessToken, result.refreshToken, next);
          } else if (result.canceled) {
            injectAuthResult(false, null); // silent reset
          } else {
            injectAuthResult(false, result.message ?? "Google sign-in failed.");
          }
        } catch (e) {
          injectAuthResult(false, e instanceof Error ? e.message : "Google sign-in failed.");
        }
      }
    },
    [injectAuthResult, injectSetSession]
  );

  // Route non-http schemes and off-site navigations to the system browser;
  // keep same-host + Stripe/Supabase traffic inside the WebView.
  const onShouldStartLoadWithRequest: ShouldStart = useCallback((request) => {
    const { url } = request;

    if (!/^https?:/i.test(url)) {
      // mailto:, tel:, sms:, maps:, itms-apps:, etc. — hand to the OS. Our own
      // athena:// deep links are consumed by the OAuth session, not navigation.
      if (!url.startsWith("athena:")) {
        Linking.openURL(url).catch(() => {});
      }
      return false;
    }

    // Only govern top-frame navigations; let sub-frames / resources load freely.
    // (isTopFrame is provided on iOS; treated as top-frame when undefined.)
    if (request.isTopFrame === false) return true;

    if (stayInWebView(url)) return true;

    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  const onOpenWindow: OpenWindow = useCallback((event) => {
    const target = event.nativeEvent.targetUrl;
    if (target) Linking.openURL(target).catch(() => {});
  }, []);

  const onNavigationStateChange: NavStateChange = useCallback((nav) => {
    setCanGoBack(nav.canGoBack);
  }, []);

  const markReady = useCallback(() => {
    if (readyFired.current) return;
    readyFired.current = true;
    onReady?.();
  }, [onReady]);

  // Android hardware back → WebView history.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const reload = useCallback(() => {
    setErrored(false);
    webRef.current?.reload();
  }, []);

  const source = useMemo(() => ({ uri: WEB_URL }), []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={source}
        originWhitelist={["https://*", "http://*", "athena://*"]}
        applicationNameForUserAgent={APP_UA_TAG}
        injectedJavaScriptBeforeContentLoaded={INJECTED_BEFORE_LOAD}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onOpenWindow={onOpenWindow}
        onNavigationStateChange={onNavigationStateChange}
        onLoadEnd={markReady}
        onError={() => {
          markReady();
          setErrored(true);
        }}
        onHttpError={() => markReady()}
        onRenderProcessGone={() => webRef.current?.reload()}
        onContentProcessDidTerminate={() => webRef.current?.reload()}
        // Media: needed for voice tutoring, TTS playback, and camera capture.
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        // File upload (image attach / handwriting photos).
        allowFileAccess
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setSupportMultipleWindows
        startInLoadingState
        renderLoading={() => <LoadingScreen />}
        overScrollMode="never"
        style={styles.web}
      />
      {errored ? <ErrorScreen onRetry={reload} /> : null}
    </View>
  );
}

function LoadingScreen() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <ActivityIndicator size="large" color={AMBER} />
    </View>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Text style={styles.errorTitle}>Can’t reach Athena</Text>
      <Text style={styles.errorBody}>Check your connection and try again.</Text>
      <Pressable style={styles.retry} onPress={onRetry}>
        <Text style={styles.retryText}>Reload</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  web: { flex: 1, backgroundColor: "#ffffff" },
  center: { alignItems: "center", justifyContent: "center", backgroundColor: NAVY, padding: 24 },
  errorTitle: { color: "#ffffff", fontSize: 20, fontWeight: "600", marginBottom: 8 },
  errorBody: { color: "#c9d2e3", fontSize: 15, textAlign: "center", marginBottom: 24 },
  retry: { backgroundColor: AMBER, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  retryText: { color: NAVY, fontSize: 16, fontWeight: "700" },
});
