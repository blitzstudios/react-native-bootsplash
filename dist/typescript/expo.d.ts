import * as Expo from "@expo/config-plugins";
type Props = {
    assetsDir?: string;
    android?: {
        parentTheme?: "TransparentStatus" | "EdgeToEdge";
        darkContentBarsStyle?: boolean;
    };
};
export declare const withBootSplash: Expo.ConfigPlugin<Props | undefined>;
export {};
//# sourceMappingURL=expo.d.ts.map