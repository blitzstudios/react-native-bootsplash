#import "RNBootSplash.h"

#import <AVFoundation/AVFoundation.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTUtils.h>

#if RCT_NEW_ARCH_ENABLED
#import <React/RCTSurfaceHostingProxyRootView.h>
#import <React/RCTSurfaceHostingView.h>

static RCTSurfaceHostingProxyRootView *_rootView = nil;
#else
#import <React/RCTRootView.h>

static UIView *_rootView = nil;
#endif

static UIView *_loadingView = nil;
static NSMutableArray<RCTPromiseResolveBlock> *_resolveQueue = [[NSMutableArray alloc] init];
static bool _fade = false;
static bool _forced = false;
static bool _nativeHidden = false;
static NSString *_storyboardName = nil;

#pragma mark - Animated splash

// Full-screen view that plays an app-provided video (declared via the
// `RNBootSplashAnimation` Info.plist key) over the boot splash background and then
// holds its last frame. This mirrors the Android RNBootSplashDialog animation path
// so both platforms are configured declaratively (a manifest entry + a bundled
// asset) and driven entirely by the library — the app ships no playback code.
//
// Playback uses AVPlayerLayer (hardware-decoded, render-server composited) rather
// than an animated image: during launch RN's bridge/JSI init saturates the main
// thread and stalls a frame-driven animation mid-playback, whereas a video keeps
// playing smoothly.

// How far past the configured duration the elapsed-time ceiling is allowed to run.
// Absorbs the gap between the animation being scheduled and the player actually
// rendering its first frame, which can stretch during a contended cold start.
static const NSTimeInterval kRNBootSplashAnimationGrace = 1.0;

@interface RNBootSplashAnimationView : UIView
- (instancetype)initWithURL:(NSURL *)url durationMs:(NSInteger)durationMs;
// Seconds remaining until the single playthrough completes (0 once finished).
- (NSTimeInterval)remainingAnimationTime;
@end

@implementation RNBootSplashAnimationView {
  AVPlayer *_player;
  AVPlayerLayer *_playerLayer;
  CFTimeInterval _startTime;
  NSTimeInterval _duration;
  BOOL _playbackStarted;
}

- (instancetype)initWithURL:(NSURL *)url durationMs:(NSInteger)durationMs {
  if (self = [super initWithFrame:CGRectZero]) {
    _duration = durationMs / 1000.0;
    // Anchor the ceiling's clock now rather than when playback begins: if this view
    // never reaches a window the remaining time must still run down, otherwise hide
    // would be deferred forever. Re-anchored in didMoveToWindow.
    _startTime = CACurrentMediaTime();

    _player = [AVPlayer playerWithURL:url];
    _player.muted = YES;
    // Play once, then hold the last frame (no loop, no rewind).
    _player.actionAtItemEnd = AVPlayerActionAtItemEndPause;

    _playerLayer = [AVPlayerLayer playerLayerWithPlayer:_player];
    _playerLayer.videoGravity = AVLayerVideoGravityResizeAspectFill;
    _playerLayer.frame = self.bounds;
    [self.layer addSublayer:_playerLayer];

    // iOS pauses playback when the app is suspended and never resumes on its own,
    // which would otherwise leave the splash frozen mid-animation.
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(onApplicationDidBecomeActive)
                                                 name:UIApplicationDidBecomeActiveNotification
                                               object:nil];
  }

  return self;
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self
                                                 name:UIApplicationDidBecomeActiveNotification
                                               object:nil];
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _playerLayer.frame = self.bounds;
}

- (void)didMoveToWindow {
  [super didMoveToWindow];

  if (self.window == nil) {
    return;
  }

  if (!_playbackStarted) {
    _playbackStarted = YES;
    _startTime = CACurrentMediaTime();
  }

  [_player play];
}

- (void)onApplicationDidBecomeActive {
  if (self.window != nil && [self remainingAnimationTime] > 0) {
    [_player play];
  }
}

- (NSTimeInterval)remainingAnimationTime {
  AVPlayerItem *item = _player.currentItem;
  NSTimeInterval itemDuration = item != nil ? CMTimeGetSeconds(item.duration) : NAN;
  BOOL itemDurationKnown = isfinite(itemDuration) && itemDuration > 0;

  // Prefer the asset's own length when the app declares no duration, so the ceiling
  // below is never derived from a zero budget.
  if (_duration <= 0 && itemDurationKnown) {
    _duration = itemDuration;
  }

  // Elapsed-time ceiling. Playback can stop making progress — the player pauses
  // while the app is suspended and does not resume on its own — so the remaining
  // time must be bounded by something that always runs down, or hide would be
  // deferred forever. The grace margin keeps this from cutting the animation short
  // when playback starts late.
  NSTimeInterval ceiling = _duration > 0
    ? MAX(0, _duration + kRNBootSplashAnimationGrace - (CACurrentMediaTime() - _startTime))
    : 0;

  // Playback position is the source of truth for whether the animation has actually
  // finished, so becoming ready-to-play slowly under cold-start contention cannot
  // clip the tail.
  if (itemDurationKnown) {
    NSTimeInterval current = CMTimeGetSeconds([item currentTime]);

    if (isfinite(current)) {
      return MIN(MAX(0, itemDuration - current), ceiling);
    }
  }

  return ceiling;
}

@end

// Non-nil only while an app-configured animated splash is on screen; drives the
// wait-for-animation logic in hideAndClearPromiseQueue.
static RNBootSplashAnimationView *_animationView = nil;

@implementation RNBootSplash

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (dispatch_queue_t)methodQueue {
  return dispatch_get_main_queue();
}

+ (bool)isLoadingViewVisible {
  return _loadingView != nil && ![_loadingView isHidden];
}

// Adds the app-configured animated splash on top of the current loading view.
// No-op unless the app declares `RNBootSplashAnimation` (a bundled asset name,
// e.g. "splash_loadin.mp4") in its Info.plist, alongside an optional
// `RNBootSplashAnimationDuration` (single-playthrough length in ms). Keeps the
// library asset-agnostic: the app owns the file + config, the library the playback.
+ (void)attachAnimationViewIfConfigured {
  NSString *name = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"RNBootSplashAnimation"];

  if (![name isKindOfClass:[NSString class]] || [name length] == 0 || _loadingView == nil) {
    return;
  }

  NSString *resource = [name stringByDeletingPathExtension];
  NSString *extension = [name pathExtension];

  if ([extension length] == 0) {
    extension = @"mp4";
  }

  NSURL *url = [[NSBundle mainBundle] URLForResource:resource withExtension:extension];

  if (url == nil) {
    return;
  }

  NSInteger durationMs = 0;
  id duration = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"RNBootSplashAnimationDuration"];

  if ([duration isKindOfClass:[NSNumber class]]) {
    durationMs = [duration integerValue];
  }

  RNBootSplashAnimationView *animationView = [[RNBootSplashAnimationView alloc] initWithURL:url
                                                                                durationMs:durationMs];
  animationView.frame = _loadingView.bounds;
  animationView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;

  [_loadingView addSubview:animationView];
  _animationView = animationView;
}

+ (void)clearResolveQueue {
  while ([_resolveQueue count] > 0) {
    RCTPromiseResolveBlock resolve = [_resolveQueue objectAtIndex:0];
    [_resolveQueue removeObjectAtIndex:0];
    resolve(@(true));
  }
}

+ (void)hideAndClearPromiseQueue {
  if (![self isLoadingViewVisible]) {
    return [RNBootSplash clearResolveQueue];
  }

  // Native-owned timing: unless a forced hide was requested, wait for the splash
  // animation to finish playing before dismissing.
  if (!_forced && _animationView != nil) {
    NSTimeInterval remaining = [_animationView remainingAnimationTime];

    if (remaining > 0) {
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(remaining * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        [RNBootSplash hideAndClearPromiseQueue];
      });

      return;
    }
  }

  if (_fade) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [UIView transitionWithView:_rootView
                        duration:0.250
                         options:UIViewAnimationOptionTransitionCrossDissolve
                      animations:^{
        _loadingView.hidden = YES;
      }
                      completion:^(__unused BOOL finished) {
        [_loadingView removeFromSuperview];
        _loadingView = nil;
        _animationView = nil;

        return [RNBootSplash clearResolveQueue];
      }];
    });
  } else {
    _loadingView.hidden = YES;
    [_loadingView removeFromSuperview];
    _loadingView = nil;
    _animationView = nil;

    return [RNBootSplash clearResolveQueue];
  }
}

+ (void)initWithStoryboard:(NSString * _Nonnull)storyboardName
                  rootView:(UIView * _Nullable)rootView {
  if (RCTRunningInAppExtension()) {
    return;
  }

  _storyboardName = storyboardName;

  [NSTimer scheduledTimerWithTimeInterval:0.35
                                  repeats:NO
                                    block:^(NSTimer * _Nonnull timer) {
    // wait for native iOS launch screen to fade out
    _nativeHidden = true;

    // hide has been called before native launch screen fade out
    if ([_resolveQueue count] > 0) {
      [self hideAndClearPromiseQueue];
    }
  }];

  if (rootView != nil) {
#ifdef RCT_NEW_ARCH_ENABLED
    _rootView = (RCTSurfaceHostingProxyRootView *)rootView;
#else
    _rootView = (RCTRootView *)rootView;
#endif

    UIStoryboard *storyboard = [UIStoryboard storyboardWithName:storyboardName bundle:nil];

    _loadingView = [[storyboard instantiateInitialViewController] view];
    _loadingView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _loadingView.frame = _rootView.bounds;
    _loadingView.center = (CGPoint){CGRectGetMidX(_rootView.bounds), CGRectGetMidY(_rootView.bounds)};
    _loadingView.hidden = NO;

#if RCT_NEW_ARCH_ENABLED
    [_rootView disableActivityIndicatorAutoHide:YES];
    [_rootView setLoadingView:_loadingView];
#else
    [_rootView addSubview:_loadingView];
#endif

    [self attachAnimationViewIfConfigured];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(onJavaScriptDidLoad)
                                                 name:RCTJavaScriptDidLoadNotification
                                               object:nil];

    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(onJavaScriptDidFailToLoad)
                                                 name:RCTJavaScriptDidFailToLoadNotification
                                               object:nil];
  }
}

+ (void)onJavaScriptDidLoad {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

+ (void)onJavaScriptDidFailToLoad {
  [self hideAndClearPromiseQueue];
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSDictionary *)constantsToExport {
  __block bool darkModeEnabled = false;

  RCTUnsafeExecuteOnMainQueueSync(^{
    UIWindow *window = RCTKeyWindow();
    darkModeEnabled = window != nil && window.traitCollection.userInterfaceStyle == UIUserInterfaceStyleDark;
  });

  return @{
    @"darkModeEnabled": @(darkModeEnabled)
  };
}

- (void)hideImpl:(BOOL)fade
          forced:(BOOL)forced
         resolve:(RCTPromiseResolveBlock)resolve {
  if (RCTRunningInAppExtension()) {
    return resolve(@(true));
  }

  [_resolveQueue addObject:resolve];
  _fade = fade;
  _forced = forced;

  if (_nativeHidden) {
    return [RNBootSplash hideAndClearPromiseQueue];
  }
}

- (void)showImpl:(BOOL)fade
         resolve:(RCTPromiseResolveBlock)resolve {
  if (RCTRunningInAppExtension() || _rootView == nil || _storyboardName == nil) {
    return resolve(@(false));
  }

  // If already visible, just resolve
  if ([RNBootSplash isLoadingViewVisible]) {
    return resolve(@(true));
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIStoryboard *storyboard = [UIStoryboard storyboardWithName:_storyboardName bundle:nil];
    
    _loadingView = [[storyboard instantiateInitialViewController] view];
    _loadingView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _loadingView.frame = _rootView.bounds;
    _loadingView.center = (CGPoint){CGRectGetMidX(_rootView.bounds), CGRectGetMidY(_rootView.bounds)};
    _loadingView.hidden = NO;
    
#if RCT_NEW_ARCH_ENABLED
    [_rootView setLoadingView:_loadingView];
#else
    [_rootView addSubview:_loadingView];
#endif

    [RNBootSplash attachAnimationViewIfConfigured];

    // Wait for next frame to ensure the view is actually rendered on screen
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.05 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      resolve(@(true));
    });
  });
}

- (void)isVisibleImpl:(RCTPromiseResolveBlock)resolve {
  resolve(@([RNBootSplash isLoadingViewVisible]));
}

#ifdef RCT_NEW_ARCH_ENABLED

// New architecture

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeRNBootSplashSpecJSI>(params);
}

- (facebook::react::ModuleConstants<JS::NativeRNBootSplash::Constants::Builder>)getConstants {
  return [self constantsToExport];
}

- (void)hide:(BOOL)fade
      forced:(BOOL)forced
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject {
  [self hideImpl:fade forced:forced resolve:resolve];
}

- (void)show:(BOOL)fade
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject {
  [self showImpl:fade resolve:resolve];
}

- (void)isVisible:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject {
  [self isVisibleImpl:resolve];
}

#else

// Old architecture

RCT_EXPORT_METHOD(hide:(BOOL)fade
                  forced:(BOOL)forced
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [self hideImpl:fade forced:forced resolve:resolve];
}

RCT_EXPORT_METHOD(show:(BOOL)fade
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [self showImpl:fade resolve:resolve];
}

RCT_EXPORT_METHOD(isVisible:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
  [self isVisibleImpl:resolve];
}

#endif

@end
