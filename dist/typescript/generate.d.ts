import detectIndent from "detect-indent";
import { HTMLElement } from "node-html-parser";
import type { Options as PrettierOptions } from "prettier";
import { type Sharp } from "sharp";
import { type XMLFormatterOptions } from "xml-formatter";
type ProjectType = "detect" | "bare" | "expo";
type Platforms = ("android" | "ios" | "web")[];
export type RGBColor = {
    R: string;
    G: string;
    B: string;
};
type Color = {
    hex: string;
    rgb: RGBColor;
};
export declare const log: {
    error: (text: string) => void;
    title: (emoji: string, text: string) => void;
    warn: (text: string) => void;
    write: (filePath: string, dimensions?: {
        width: number;
        height: number;
    }) => void;
};
export declare const hfs: {
    buffer: (path: string) => NonSharedBuffer;
    exists: (path: string) => boolean;
    isDir: (path: string) => boolean;
    json: (path: string) => unknown;
    readDir: (path: string) => string[];
    realPath: (path: string) => string;
    rm: (path: string) => void;
    text: (path: string) => string;
    copy: (src: string, dest: string) => void;
    ensureDir: (dir: string) => void;
    write: (path: string, content: string) => void;
};
export declare const getExpoConfig: (from: string) => {
    isExpo: boolean;
};
export declare const writeJson: (filePath: string, content: object) => void;
type FormatOptions = {
    indent?: detectIndent.Indent;
} & ({
    formatter: "prettier";
    selfClosingTags?: boolean;
    useCssPlugin?: boolean;
    htmlWhitespaceSensitivity?: PrettierOptions["htmlWhitespaceSensitivity"];
    singleAttributePerLine?: PrettierOptions["singleAttributePerLine"];
} | {
    formatter: "xmlFormatter";
    whiteSpaceAtEndOfSelfclosingTag?: XMLFormatterOptions["whiteSpaceAtEndOfSelfclosingTag"];
});
export declare const readXmlLike: (filePath: string) => {
    root: HTMLElement;
    formatOptions: {
        indent: detectIndent.Indent;
    };
};
export declare const writeXmlLike: (filePath: string, content: string, { indent, ...formatOptions }: FormatOptions) => Promise<void>;
export declare const cleanIOSAssets: (dir: string) => void;
export type AddonConfig = {
    licenseKey: string;
    isExpo: boolean;
    fileNameSuffix: string;
    androidOutputPath: string | void;
    iosOutputPath: string | void;
    htmlTemplatePath: string | void;
    assetsOutputPath: string;
    logoPath: string;
    darkLogoPath: string | undefined;
    brandPath: string | undefined;
    darkBrandPath: string | undefined;
    logoHeight: number;
    logoWidth: number;
    brandHeight: number;
    brandWidth: number;
    background: Color;
    logo: Sharp;
    brand: Sharp | undefined;
    darkBackground: Color | undefined;
    darkLogo: Sharp | undefined;
    darkBrand: Sharp | undefined;
};
export declare const generate: ({ projectType, platforms, html, flavor, licenseKey, ...args }: {
    logo: string;
    projectType: ProjectType;
    platforms: Platforms;
    background: string;
    logoWidth: number;
    assetsOutput: string;
    html: string;
    flavor: string;
    licenseKey?: string;
    brand?: string;
    brandWidth: number;
    darkBackground?: string;
    darkLogo?: string;
    darkBrand?: string;
}) => Promise<void>;
export {};
//# sourceMappingURL=generate.d.ts.map