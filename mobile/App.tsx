import "react-native-url-polyfill/auto";

import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { AthenaWebView } from "./src/AthenaWebView";

// Hold the native splash until the WebView paints its first frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Color behind the notch / home indicator. Matches the web app's light
// background; if you default the app to a dark theme, switch this to a dark
// value and set the StatusBar style to "light".
const SAFE_AREA_BG = "#ffffff";

export default function App() {
  const onReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
          <AthenaWebView onReady={onReady} />
        </SafeAreaView>
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SAFE_AREA_BG },
  safe: { flex: 1, backgroundColor: SAFE_AREA_BG },
});
