"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.writeXmlLike = exports.writeJson = exports.readXmlLike = exports.log = exports.hfs = exports.getExpoConfig = exports.generate = exports.cleanIOSAssets = void 0;
var Expo = _interopRequireWildcard(require("@expo/config-plugins"));
var _plist = _interopRequireDefault(require("@expo/plist"));
var _cliConfigAndroid = require("@react-native-community/cli-config-android");
var _cliConfigApple = require("@react-native-community/cli-config-apple");
var _cliTools = require("@react-native-community/cli-tools");
var _child_process = _interopRequireDefault(require("child_process"));
var _crypto = _interopRequireDefault(require("crypto"));
var _detectIndent = _interopRequireDefault(require("detect-indent"));
var _fsExtra = _interopRequireDefault(require("fs-extra"));
var _nodeHtmlParser = require("node-html-parser");
var _path = _interopRequireDefault(require("path"));
var _picocolors = _interopRequireDefault(require("picocolors"));
var htmlPlugin = _interopRequireWildcard(require("prettier/plugins/html"));
var cssPlugin = _interopRequireWildcard(require("prettier/plugins/postcss"));
var prettier = _interopRequireWildcard(require("prettier/standalone"));
var _semver = _interopRequireDefault(require("semver"));
var _sharp = _interopRequireDefault(require("sharp"));
var _tsDedent = require("ts-dedent");
var _util = _interopRequireDefault(require("util"));
var _xmlFormatter = _interopRequireDefault(require("xml-formatter"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
const workingPath = process.env.INIT_CWD ?? process.env.PWD ?? process.cwd();
const projectRoot = (0, _cliTools.findProjectRoot)(workingPath);
const getIOSProjectConfig = (0, _cliConfigApple.getProjectConfig)({
  platformName: "ios"
});
const ios = getIOSProjectConfig(projectRoot, {});
const android = (0, _cliConfigAndroid.projectConfig)(projectRoot);
const promisifiedExec = _util.default.promisify(_child_process.default.exec);
const exec = cmd => promisifiedExec(cmd).then(({
  stdout,
  stderr
}) => stdout || stderr);
const log = exports.log = {
  error: text => {
    console.log(_picocolors.default.red(`❌  ${text}`));
  },
  title: (emoji, text) => {
    console.log(`\n${emoji}  ${_picocolors.default.underline(_picocolors.default.bold(text))}`);
  },
  warn: text => {
    console.log(_picocolors.default.yellow(`⚠️   ${text}`));
  },
  write: (filePath, dimensions) => {
    console.log(`    ${_path.default.relative(workingPath, filePath)}` + (dimensions != null ? ` (${dimensions.width}x${dimensions.height})` : ""));
  }
};
const parseColor = value => {
  const up = value.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (up.length !== 3 && up.length !== 6) {
    log.error(`"${value}" value is not a valid hexadecimal color.`);
    process.exit(1);
  }
  const hex = up.length === 3 ? "#" + up[0] + up[0] + up[1] + up[1] + up[2] + up[2] : "#" + up;
  const rgb = {
    R: (Number.parseInt("" + hex[1] + hex[2], 16) / 255).toPrecision(15),
    G: (Number.parseInt("" + hex[3] + hex[4], 16) / 255).toPrecision(15),
    B: (Number.parseInt("" + hex[5] + hex[6], 16) / 255).toPrecision(15)
  };
  return {
    hex: hex.toLowerCase(),
    rgb
  };
};
const getStoryboard = ({
  logoHeight,
  logoWidth,
  background: {
    R,
    G,
    B
  },
  fileNameSuffix
}) => {
  const frameWidth = 375;
  const frameHeight = 667;
  const logoX = (frameWidth - logoWidth) / 2;
  const logoY = (frameHeight - logoHeight) / 2;
  return (0, _tsDedent.dedent)`
<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="21701" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="01J-lp-oVM">
    <device id="retina4_7" orientation="portrait" appearance="light"/>
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="21678"/>
        <capability name="Named colors" minToolsVersion="9.0"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <!--View Controller-->
        <scene sceneID="EHf-IW-A2E">
            <objects>
                <viewController modalTransitionStyle="crossDissolve" id="01J-lp-oVM" sceneMemberID="viewController">
                    <view key="view" autoresizesSubviews="NO" contentMode="scaleToFill" id="Ze5-6b-2t3">
                        <rect key="frame" x="0.0" y="0.0" width="${frameWidth}" height="${frameHeight}"/>
                        <autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
                        <subviews>
                            <imageView autoresizesSubviews="NO" clipsSubviews="YES" userInteractionEnabled="NO" contentMode="scaleAspectFit" image="BootSplashLogo-${fileNameSuffix}" translatesAutoresizingMaskIntoConstraints="NO" id="3lX-Ut-9ad">
                                <rect key="frame" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}"/>
                                <accessibility key="accessibilityConfiguration">
                                    <accessibilityTraits key="traits" image="YES" notEnabled="YES"/>
                                </accessibility>
                            </imageView>
                        </subviews>
                        <viewLayoutGuide key="safeArea" id="Bcu-3y-fUS"/>
                        <color key="backgroundColor" name="BootSplashBackground-${fileNameSuffix}"/>
                        <constraints>
                            <constraint firstItem="3lX-Ut-9ad" firstAttribute="centerX" secondItem="Ze5-6b-2t3" secondAttribute="centerX" id="Fh9-Fy-1nT"/>
                            <constraint firstItem="3lX-Ut-9ad" firstAttribute="centerY" secondItem="Ze5-6b-2t3" secondAttribute="centerY" id="nvB-Ic-PnI"/>
                        </constraints>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="iYj-Kq-Ea1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="0.0" y="0.0"/>
        </scene>
    </scenes>
    <resources>
        <image name="BootSplashLogo-${fileNameSuffix}" width="${logoWidth}" height="${logoHeight}"/>
        <namedColor name="BootSplashBackground-${fileNameSuffix}">
            <color red="${R}" green="${G}" blue="${B}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
        </namedColor>
    </resources>
</document>
`;
};

// Freely inspired by https://github.com/humanwhocodes/humanfs
const hfs = exports.hfs = {
  buffer: path => _fsExtra.default.readFileSync(path),
  exists: path => _fsExtra.default.existsSync(path),
  isDir: path => _fsExtra.default.lstatSync(path).isDirectory(),
  json: path => JSON.parse(_fsExtra.default.readFileSync(path, "utf-8")),
  readDir: path => _fsExtra.default.readdirSync(path, "utf-8"),
  realPath: path => _fsExtra.default.realpathSync(path, "utf-8"),
  rm: path => _fsExtra.default.rmSync(path, {
    force: true,
    recursive: true
  }),
  text: path => _fsExtra.default.readFileSync(path, "utf-8"),
  copy: (src, dest) => {
    if (hfs.isDir(src) || !hfs.exists(dest)) {
      return _fsExtra.default.copySync(src, dest, {
        overwrite: true
      });
    }
    const srcBuffer = _fsExtra.default.readFileSync(src);
    const destBuffer = _fsExtra.default.readFileSync(dest);
    if (!srcBuffer.equals(destBuffer)) {
      return _fsExtra.default.copySync(src, dest, {
        overwrite: true
      });
    }
  },
  ensureDir: dir => {
    _fsExtra.default.mkdirSync(dir, {
      recursive: true
    });
  },
  write: (path, content) => {
    const trimmed = content.trim();
    _fsExtra.default.writeFileSync(path, trimmed === "" ? trimmed : trimmed + "\n", "utf-8");
  }
};

// Adapted from https://github.com/square/find-yarn-workspace-root
const findUp = (from, matcher) => {
  let previous;
  let current = _path.default.normalize(from);
  do {
    const found = matcher(current);
    if (typeof found !== "undefined") {
      return found;
    }
    previous = current;
    current = _path.default.dirname(current);
  } while (current !== previous);
};
const getExpoConfig = from => {
  const hasDependency = findUp(from, dir => {
    const pkgPath = _path.default.resolve(dir, "package.json");
    if (_fsExtra.default.existsSync(pkgPath)) {
      try {
        const pkg = hfs.json(pkgPath);
        return pkg.dependencies?.expo != null;
      } catch {} // eslint-disable-line no-empty
    }
  }) ?? false;
  if (!hasDependency) {
    return {
      isExpo: false
    };
  }
  const version = findUp(from, dir => {
    const pkgPath = _path.default.resolve(dir, "node_modules", "expo", "package.json");
    if (_fsExtra.default.existsSync(pkgPath)) {
      try {
        const pkg = hfs.json(pkgPath);
        return pkg.version;
      } catch {} // eslint-disable-line no-empty
    }
  });
  if (version == null || _semver.default.lt(version, "51.0.20")) {
    log.error("Requires Expo 51.0.20 (or higher)");
    process.exit(1);
  }
  return {
    isExpo: true
  };
};
exports.getExpoConfig = getExpoConfig;
const writeJson = (filePath, content) => {
  hfs.write(filePath, JSON.stringify(content, null, 2));
  log.write(filePath);
};
exports.writeJson = writeJson;
const readXmlLike = filePath => {
  const content = hfs.text(filePath);
  return {
    root: (0, _nodeHtmlParser.parse)(content),
    formatOptions: {
      indent: (0, _detectIndent.default)(content)
    }
  };
};
exports.readXmlLike = readXmlLike;
const writeXmlLike = async (filePath, content, {
  indent,
  ...formatOptions
}) => {
  if (formatOptions.formatter === "prettier") {
    const {
      formatter,
      useCssPlugin = false,
      selfClosingTags = false,
      ...options
    } = formatOptions;
    const formatted = await prettier.format(content, {
      parser: "html",
      bracketSameLine: true,
      printWidth: 10000,
      plugins: [htmlPlugin, ...(useCssPlugin ? [cssPlugin] : [])],
      useTabs: indent?.type === "tab",
      tabWidth: (indent?.amount ?? 0) || 2,
      ...options
    });
    hfs.write(filePath, selfClosingTags ? formatted.replace(/><\/[a-z-0-9]+>/gi, " />") : formatted);
    log.write(filePath);
  } else {
    const {
      formatter,
      ...options
    } = formatOptions;
    const formatted = (0, _xmlFormatter.default)(content, {
      collapseContent: true,
      forceSelfClosingEmptyTag: true,
      lineSeparator: "\n",
      whiteSpaceAtEndOfSelfclosingTag: true,
      indentation: (indent?.indent ?? "") || "    ",
      ...options
    });
    hfs.write(filePath, formatted);
    log.write(filePath);
  }
};
exports.writeXmlLike = writeXmlLike;
const cleanIOSAssets = dir => {
  hfs.readDir(dir).filter(file => file === "Colors.xcassets" || file === "Images.xcassets").map(file => _path.default.join(dir, file)).flatMap(dir => hfs.readDir(dir).filter(file => file.startsWith("BootSplash")).map(file => _path.default.join(dir, file))).forEach(file => {
    hfs.rm(file);
  });
};
exports.cleanIOSAssets = cleanIOSAssets;
const getImageBase64 = async (image, width) => {
  if (image == null) {
    return "";
  }
  const buffer = await image.clone().resize(width).png({
    quality: 100
  }).toBuffer();
  return buffer.toString("base64");
};
const getFileNameSuffix = async ({
  background,
  brand,
  brandWidth,
  darkBackground,
  darkBrand,
  darkLogo,
  logo,
  logoWidth
}) => {
  const [logoHash, darkLogoHash, brandHash, darkBrandHash] = await Promise.all([getImageBase64(logo, logoWidth), getImageBase64(darkLogo, logoWidth), getImageBase64(brand, brandWidth), getImageBase64(darkBrand, brandWidth)]);
  const record = {
    background: background.hex,
    darkBackground: darkBackground?.hex ?? "",
    logo: logoHash,
    darkLogo: darkLogoHash,
    brand: brandHash,
    darkBrand: darkBrandHash
  };
  const stableKey = Object.keys(record).sort().map(key => record[key]).join();
  return _crypto.default.createHash("shake256", {
    outputLength: 3
  }).update(stableKey).digest("hex").toLowerCase();
};
const ensureSupportedFormat = async (name, image) => {
  if (image == null) {
    return;
  }
  const {
    format
  } = await image.metadata();
  if (format !== "png" && format !== "svg") {
    log.error(`${name} image file format (${format}) is not supported`);
    process.exit(1);
  }
};
const getAndroidOutputPath = ({
  assetsOutputPath,
  brandHeight,
  brandWidth,
  flavor,
  isExpo,
  logoHeight,
  logoWidth,
  platforms
}) => {
  if (!platforms.includes("android")) {
    return;
  }
  const withSizeChecks = assetsOutputPath => {
    if (logoWidth > 192 || logoHeight > 192) {
      return log.warn("Logo size exceeding 192x192dp will be cropped by Android. Skipping Android assets generation…");
    }
    if (brandWidth > 200 || brandHeight > 80) {
      return log.warn("Brand size exceeding 200x80dp will be cropped by Android. Skipping Android assets generation…");
    }
    if (logoWidth > 134 || logoHeight > 134) {
      log.warn("Logo size exceeds 134x134dp. It might be cropped by Android.");
    }
    return assetsOutputPath;
  };
  if (isExpo) {
    return withSizeChecks(_path.default.resolve(assetsOutputPath, "android"));
  }
  if (android == null) {
    return;
  }
  const androidOutputPath = _path.default.resolve(android.sourceDir, android.appName, "src", flavor, "res");
  if (!hfs.exists(androidOutputPath)) {
    return log.warn(`No ${_path.default.relative(workingPath, androidOutputPath)} directory found. Skipping Android assets generation…`);
  }
  return withSizeChecks(androidOutputPath);
};
const getIOSOutputPath = ({
  assetsOutputPath,
  isExpo,
  platforms
}) => {
  if (!platforms.includes("ios")) {
    return;
  }
  if (isExpo) {
    return _path.default.resolve(assetsOutputPath, "ios");
  }
  if (ios == null) {
    return;
  }
  if (ios.xcodeProject == null) {
    return log.warn("No Xcode project found. Skipping iOS assets generation…");
  }
  const iosOutputPath = _path.default.resolve(ios.sourceDir, ios.xcodeProject.name).replace(/\.(xcodeproj|xcworkspace)$/, "");
  if (!hfs.exists(iosOutputPath)) {
    return log.warn(`No ${_path.default.relative(workingPath, iosOutputPath)} directory found. Skipping iOS assets generation…`);
  }
  return iosOutputPath;
};
const getHtmlTemplatePath = async ({
  isExpo,
  html,
  platforms
}) => {
  if (!platforms.includes("web")) {
    return;
  }
  if (isExpo) {
    const htmlTemplatePath = _path.default.resolve(workingPath, html);
    const htmlTemplateRelativePath = _path.default.relative(workingPath, htmlTemplatePath);
    if (htmlTemplateRelativePath === "public/index.html" && !hfs.exists(htmlTemplatePath)) {
      const cmd = `npx expo customize ${htmlTemplateRelativePath}`;
      console.log(_picocolors.default.dim(`Running ${cmd}`));
      await exec(cmd);
    }
  }
  const htmlTemplatePath = _path.default.resolve(workingPath, html);
  if (!hfs.exists(htmlTemplatePath)) {
    return log.warn(`No ${_path.default.relative(workingPath, htmlTemplatePath)} file found. Skipping HTML + CSS generation…`);
  }
  return htmlTemplatePath;
};
const getImageHeight = (image, width) => {
  if (image == null) {
    return Promise.resolve(0);
  }
  return image.clone().resize(width).toBuffer().then(buffer => (0, _sharp.default)(buffer).metadata()).then(({
    height = 0
  }) => Math.round(height));
};
const requireAddon = () => {
  try {
    return require("./addon"); // eslint-disable-line
  } catch {
    return;
  }
};
const generate = async ({
  projectType,
  platforms,
  html,
  flavor,
  licenseKey,
  ...args
}) => {
  const isExpo = projectType === "expo" || projectType === "detect" && getExpoConfig(workingPath).isExpo;
  if (_semver.default.lt(process.versions.node, "18.0.0")) {
    log.error("Requires Node 18 (or higher)");
    process.exit(1);
  }
  const logoPath = _path.default.resolve(workingPath, args.logo);
  const darkLogoPath = args.darkLogo != null ? _path.default.resolve(workingPath, args.darkLogo) : undefined;
  const brandPath = args.brand != null ? _path.default.resolve(workingPath, args.brand) : undefined;
  const darkBrandPath = args.darkBrand != null ? _path.default.resolve(workingPath, args.darkBrand) : undefined;
  const assetsOutputPath = _path.default.resolve(workingPath, args.assetsOutput);
  const logo = (0, _sharp.default)(logoPath);
  const darkLogo = darkLogoPath != null ? (0, _sharp.default)(darkLogoPath) : undefined;
  const brand = brandPath != null ? (0, _sharp.default)(brandPath) : undefined;
  const darkBrand = darkBrandPath != null ? (0, _sharp.default)(darkBrandPath) : undefined;
  const background = parseColor(args.background);
  const logoWidth = args.logoWidth - args.logoWidth % 2;
  const brandWidth = args.brandWidth - args.brandWidth % 2;
  const darkBackground = args.darkBackground != null ? parseColor(args.darkBackground) : undefined;
  const executeAddon = brand != null || darkBackground != null || darkLogo != null || darkBrand != null;
  if (licenseKey != null && !executeAddon) {
    log.warn("You specified a license key but none of the options that requires it.");
  }
  if (licenseKey == null && executeAddon) {
    const options = [brand != null ? "brand" : "", darkBackground != null ? "dark-background" : "", darkLogo != null ? "dark-logo" : "", darkBrand != null ? "dark-brand" : ""].filter(option => option !== "").map(option => `--${option}`).join(", ");
    log.error(`You need to specify a license key in order to use ${options}.`);
    process.exit(1);
  }
  if (brand == null && darkBrand != null) {
    log.error("--dark-brand option couldn't be used without --brand.");
    process.exit(1);
  }
  await ensureSupportedFormat("Logo", logo);
  await ensureSupportedFormat("Dark logo", darkLogo);
  await ensureSupportedFormat("Brand", brand);
  await ensureSupportedFormat("Dark brand", darkBrand);
  const logoHeight = await getImageHeight(logo, logoWidth);
  const brandHeight = await getImageHeight(brand, brandWidth);
  if (logoWidth < args.logoWidth) {
    log.warn(`Logo width must be a multiple of 2. It has been rounded to ${logoWidth}dp.`);
  }
  if (brandWidth < args.brandWidth) {
    log.warn(`Brand width must be a multiple of 2. It has been rounded to ${brandWidth}dp.`);
  }
  const fileNameSuffix = await getFileNameSuffix({
    background,
    brand,
    brandWidth,
    darkBackground,
    darkBrand,
    darkLogo,
    logo,
    logoWidth
  });
  const androidOutputPath = getAndroidOutputPath({
    assetsOutputPath,
    brandHeight,
    brandWidth,
    flavor,
    isExpo,
    logoHeight,
    logoWidth,
    platforms
  });
  const iosOutputPath = getIOSOutputPath({
    assetsOutputPath,
    isExpo,
    platforms
  });
  const htmlTemplatePath = await getHtmlTemplatePath({
    isExpo,
    html,
    platforms
  });
  if (androidOutputPath != null) {
    log.title("🤖", "Android");
    hfs.ensureDir(androidOutputPath);
    await Promise.all([{
      ratio: 1,
      suffix: "mdpi"
    }, {
      ratio: 1.5,
      suffix: "hdpi"
    }, {
      ratio: 2,
      suffix: "xhdpi"
    }, {
      ratio: 3,
      suffix: "xxhdpi"
    }, {
      ratio: 4,
      suffix: "xxxhdpi"
    }].map(({
      ratio,
      suffix
    }) => {
      const drawableDirPath = _path.default.resolve(androidOutputPath, `drawable-${suffix}`);
      hfs.ensureDir(drawableDirPath);

      // https://developer.android.com/develop/ui/views/launch/splash-screen#dimensions
      const canvasSize = 288 * ratio;

      // https://sharp.pixelplumbing.com/api-constructor
      const canvas = (0, _sharp.default)({
        create: {
          width: canvasSize,
          height: canvasSize,
          channels: 4,
          background: {
            r: 255,
            g: 255,
            b: 255,
            alpha: 0
          }
        }
      });
      const filePath = _path.default.resolve(drawableDirPath, "bootsplash_logo.png");
      return logo.clone().resize(logoWidth * ratio).toBuffer().then(input => canvas.composite([{
        input
      }]).png({
        quality: 100
      }).toFile(filePath)).then(() => {
        log.write(filePath, {
          width: canvasSize,
          height: canvasSize
        });
      });
    }));
    if (!isExpo) {
      const manifestXmlPath = _path.default.resolve(androidOutputPath, "..", "AndroidManifest.xml");
      if (hfs.exists(manifestXmlPath)) {
        const manifestXml = readXmlLike(manifestXmlPath);
        const activities = manifestXml.root.querySelectorAll("activity");
        for (const activity of activities) {
          if (activity.getAttribute("android:name") === ".MainActivity") {
            activity.setAttribute("android:theme", "@style/BootTheme");
          }
        }
        await writeXmlLike(manifestXmlPath, manifestXml.root.toString(), {
          ...manifestXml.formatOptions,
          formatter: "prettier",
          htmlWhitespaceSensitivity: "ignore",
          selfClosingTags: true,
          singleAttributePerLine: true
        });
      } else {
        log.warn("No AndroidManifest.xml found. Skipping…");
      }
      const valuesPath = _path.default.resolve(androidOutputPath, "values");
      hfs.ensureDir(valuesPath);
      const colorsXmlPath = _path.default.resolve(valuesPath, "colors.xml");
      const colorsXmlEntry = `<color name="bootsplash_background">${background.hex}</color>`;
      if (hfs.exists(colorsXmlPath)) {
        const colorsXml = readXmlLike(colorsXmlPath);
        const nextColor = (0, _nodeHtmlParser.parse)(colorsXmlEntry);
        const prevColor = colorsXml.root.querySelector('color[name="bootsplash_background"]');
        if (prevColor != null) {
          prevColor.replaceWith(nextColor);
        } else {
          colorsXml.root.querySelector("resources")?.appendChild(nextColor);
        }
        await writeXmlLike(colorsXmlPath, colorsXml.root.toString(), {
          ...colorsXml.formatOptions,
          formatter: "xmlFormatter"
        });
      } else {
        await writeXmlLike(colorsXmlPath, `<resources>${colorsXmlEntry}</resources>`, {
          formatter: "xmlFormatter"
        });
      }
      const stylesXmlPath = _path.default.resolve(valuesPath, "styles.xml");
      if (hfs.exists(stylesXmlPath)) {
        const stylesXml = readXmlLike(stylesXmlPath);
        const prevStyle = stylesXml.root.querySelector('style[name="BootTheme"]');
        const parent = prevStyle?.getAttribute("parent") ?? "Theme.BootSplash";
        const extraItems = (0, _nodeHtmlParser.parse)(prevStyle?.text.split("\n").map(line => line.trim()).join("") ?? "").childNodes.filter(node => {
          if (!(node instanceof _nodeHtmlParser.HTMLElement)) {
            return true;
          }
          const name = node.getAttribute("name");
          return name !== "bootSplashBackground" && name !== "bootSplashLogo" && name !== "bootSplashBrand" && name !== "postBootSplashTheme";
        }).map(node => node.toString());
        const styleItems = [...(extraItems.length > 0 ? [...extraItems, ""] : []), '<item name="bootSplashBackground">@color/bootsplash_background</item>', '<item name="bootSplashLogo">@drawable/bootsplash_logo</item>', ...(brand != null && brandPath != null ? ['<item name="bootSplashBrand">@drawable/bootsplash_brand</item>'] : []), '<item name="postBootSplashTheme">@style/AppTheme</item>'];
        const nextStyle = (0, _nodeHtmlParser.parse)((0, _tsDedent.dedent)`
          <style name="BootTheme" parent="${parent}">
            ${styleItems.join("\n")}
          </style>
        `);
        prevStyle?.remove(); // remove the existing style
        stylesXml.root.querySelector("resources")?.appendChild(nextStyle);
        await writeXmlLike(stylesXmlPath, stylesXml.root.toString(), {
          ...stylesXml.formatOptions,
          formatter: "prettier",
          htmlWhitespaceSensitivity: "ignore"
        });
      } else {
        log.warn("No styles.xml found. Skipping…");
      }
    }
  }
  if (iosOutputPath != null) {
    log.title("🍏", "iOS");
    hfs.ensureDir(iosOutputPath);
    cleanIOSAssets(iosOutputPath);
    const storyboardPath = _path.default.resolve(iosOutputPath, "BootSplash.storyboard");
    const colorsSetPath = _path.default.resolve(iosOutputPath, "Colors.xcassets", `BootSplashBackground-${fileNameSuffix}.colorset`);
    const imageSetPath = _path.default.resolve(iosOutputPath, "Images.xcassets", `BootSplashLogo-${fileNameSuffix}.imageset`);
    hfs.ensureDir(colorsSetPath);
    hfs.ensureDir(imageSetPath);
    await writeXmlLike(storyboardPath, getStoryboard({
      logoHeight,
      logoWidth,
      background: background.rgb,
      fileNameSuffix
    }), {
      formatter: "xmlFormatter",
      whiteSpaceAtEndOfSelfclosingTag: false
    });
    writeJson(_path.default.resolve(colorsSetPath, "Contents.json"), {
      colors: [{
        idiom: "universal",
        color: {
          "color-space": "srgb",
          components: {
            blue: background.rgb.B,
            green: background.rgb.G,
            red: background.rgb.R,
            alpha: "1.000"
          }
        }
      }],
      info: {
        author: "xcode",
        version: 1
      }
    });
    const logoFileName = `logo-${fileNameSuffix}`;
    writeJson(_path.default.resolve(imageSetPath, "Contents.json"), {
      images: [{
        idiom: "universal",
        filename: `${logoFileName}.png`,
        scale: "1x"
      }, {
        idiom: "universal",
        filename: `${logoFileName}@2x.png`,
        scale: "2x"
      }, {
        idiom: "universal",
        filename: `${logoFileName}@3x.png`,
        scale: "3x"
      }],
      info: {
        author: "xcode",
        version: 1
      }
    });
    await Promise.all([{
      ratio: 1,
      suffix: ""
    }, {
      ratio: 2,
      suffix: "@2x"
    }, {
      ratio: 3,
      suffix: "@3x"
    }].map(({
      ratio,
      suffix
    }) => {
      const filePath = _path.default.resolve(imageSetPath, `${logoFileName}${suffix}.png`);
      return logo.clone().resize(logoWidth * ratio).png({
        quality: 100
      }).toFile(filePath).then(({
        width,
        height
      }) => {
        log.write(filePath, {
          width,
          height
        });
      });
    }));
    if (!isExpo) {
      const infoPlistPath = _path.default.resolve(iosOutputPath, "Info.plist");
      const infoPlist = _plist.default.parse(hfs.text(infoPlistPath));
      infoPlist["UILaunchStoryboardName"] = "BootSplash";
      const formatted = (0, _xmlFormatter.default)(_plist.default.build(infoPlist), {
        collapseContent: true,
        forceSelfClosingEmptyTag: false,
        indentation: "\t",
        lineSeparator: "\n",
        whiteSpaceAtEndOfSelfclosingTag: false
      }).replace(/<string\/>/gm, "<string></string>").replace(/^\t/gm, "");
      hfs.write(infoPlistPath, formatted);
      log.write(infoPlistPath);
      const pbxprojectPath = Expo.IOSConfig.Paths.getPBXProjectPath(projectRoot);
      const xcodeProjectPath = Expo.IOSConfig.Paths.getXcodeProjectPath(projectRoot);
      const project = Expo.IOSConfig.XcodeUtils.getPbxproj(projectRoot);
      const projectName = _path.default.basename(iosOutputPath);
      const groupName = _path.default.parse(xcodeProjectPath).name;
      Expo.IOSConfig.XcodeUtils.addResourceFileToGroup({
        project,
        filepath: _path.default.join(projectName, "BootSplash.storyboard"),
        groupName,
        isBuildFile: true
      });
      Expo.IOSConfig.XcodeUtils.addResourceFileToGroup({
        project,
        filepath: _path.default.join(projectName, "Colors.xcassets"),
        groupName,
        isBuildFile: true
      });
      hfs.write(pbxprojectPath, project.writeSync());
      log.write(pbxprojectPath);
    }
  }
  if (htmlTemplatePath != null) {
    log.title("🌐", "Web");
    const htmlTemplate = readXmlLike(htmlTemplatePath);
    const {
      format
    } = await logo.metadata();
    const prevStyle = htmlTemplate.root.querySelector("#bootsplash-style");
    const base64 = (format === "svg" ? hfs.buffer(logoPath) : await logo.clone().resize(Math.round(logoWidth * 2)).png({
      quality: 100
    }).toBuffer()).toString("base64");
    const dataURI = `data:image/${format ? "svg+xml" : "png"};base64,${base64}`;
    const nextStyle = (0, _nodeHtmlParser.parse)((0, _tsDedent.dedent)`
      <style id="bootsplash-style">
        #bootsplash {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          overflow: hidden;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: ${background.hex};
        }
        #bootsplash-logo {
          content: url("${dataURI}");
          width: ${logoWidth}px;
          height: ${logoHeight}px;
        }
      </style>
    `);
    if (prevStyle != null) {
      prevStyle.replaceWith(nextStyle);
    } else {
      htmlTemplate.root.querySelector("head")?.appendChild(nextStyle);
    }
    const prevDiv = htmlTemplate.root.querySelector("#bootsplash");
    const nextDiv = (0, _nodeHtmlParser.parse)((0, _tsDedent.dedent)`
      <div id="bootsplash">
        <div id="bootsplash-logo"></div>
      </div>
    `);
    if (prevDiv != null) {
      prevDiv.replaceWith(nextDiv);
    } else {
      htmlTemplate.root.querySelector("body")?.appendChild(nextDiv);
    }
    await writeXmlLike(htmlTemplatePath, htmlTemplate.root.toString(), {
      ...htmlTemplate.formatOptions,
      formatter: "prettier",
      useCssPlugin: true
    });
  }
  log.title("📄", "Assets");
  hfs.ensureDir(assetsOutputPath);
  writeJson(_path.default.resolve(assetsOutputPath, "manifest.json"), {
    background: background.hex,
    logo: {
      width: logoWidth,
      height: logoHeight
    }
  });
  await Promise.all([{
    ratio: 1,
    suffix: ""
  }, {
    ratio: 1.5,
    suffix: "@1,5x"
  }, {
    ratio: 2,
    suffix: "@2x"
  }, {
    ratio: 3,
    suffix: "@3x"
  }, {
    ratio: 4,
    suffix: "@4x"
  }].map(({
    ratio,
    suffix
  }) => {
    const filePath = _path.default.resolve(assetsOutputPath, `logo${suffix}.png`);
    return logo.clone().resize(Math.round(logoWidth * ratio)).png({
      quality: 100
    }).toFile(filePath).then(({
      width,
      height
    }) => {
      log.write(filePath, {
        width,
        height
      });
    });
  }));
  if (licenseKey != null && executeAddon) {
    const addon = requireAddon();
    await addon?.execute({
      licenseKey,
      isExpo,
      fileNameSuffix,
      androidOutputPath,
      iosOutputPath,
      htmlTemplatePath,
      assetsOutputPath,
      logoHeight,
      logoWidth,
      brandHeight,
      brandWidth,
      logoPath,
      darkLogoPath,
      brandPath,
      darkBrandPath,
      background,
      logo,
      brand,
      darkBackground,
      darkLogo,
      darkBrand
    });
  } else {
    console.log(`
${_picocolors.default.blue("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓")}
${_picocolors.default.blue("┃")}  🔑  ${_picocolors.default.bold("Get a license key for brand image / dark mode support")}  ${_picocolors.default.blue("┃")}
${_picocolors.default.blue("┃")}      ${_picocolors.default.underline("https://zoontek.gumroad.com/l/bootsplash-generator")}     ${_picocolors.default.blue("┃")}
${_picocolors.default.blue("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛")}`);
  }
  console.log(`\n💖  Thanks for using ${_picocolors.default.underline("react-native-bootsplash")}`);
};
exports.generate = generate;
//# sourceMappingURL=generate.js.map