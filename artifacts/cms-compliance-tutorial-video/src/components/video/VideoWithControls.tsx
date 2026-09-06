import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Repeat,
  Volume2,
  VolumeX,
} from 'lucide-react';

import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS = [
  ['Welcome', 'Scene0.tsx'],
  ['Provider selection', 'Scene1.tsx'],
  ['Four workspaces', 'Scene2.tsx'],
  ['Verified citations', 'Scene3.tsx'],
  ['Inspection readiness', 'Scene4.tsx'],
  ['Policy gap scanner', 'Scene5.tsx'],
  ['Session privacy', 'Scene6.tsx'],
  ['Billing and admin', 'Scene7.tsx'],
  ['Recommended workflow', 'Scene8.tsx'],
  ['Closing', 'Scene9.tsx'],
];

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function PlaybackStatus({
  sceneKeys,
  activeIndex,
  activeDuration,
  activeStartTime,
  totalDuration,
  tick,
  paused,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  activeStartTime: number;
  totalDuration: number;
  tick: number;
  paused: boolean;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBase = useRef(0);

  useEffect(() => {
    setElapsed(0);
    elapsedBase.current = 0;
  }, [tick]);

  useEffect(() => {
    if (paused) return;
    const startedAt = performance.now();
    const timer = window.setInterval(
      () => setElapsed(elapsedBase.current + performance.now() - startedAt),
      60,
    );
    return () => {
      window.clearInterval(timer);
      elapsedBase.current += performance.now() - startedAt;
    };
  }, [paused, tick]);

  const progress = Math.min(1, elapsed / activeDuration);
  const totalElapsed = Math.min(
    totalDuration,
    activeStartTime + Math.min(elapsed, activeDuration),
  );

  return (
    <>
      <div className="flex flex-1 items-center gap-1.5">
        {sceneKeys.map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => onJumpTo(index)}
            className="relative h-3 min-h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all hover:h-4"
            aria-label={`Jump to scene ${index + 1}`}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-white/90"
              style={{
                width: `${index === activeIndex ? progress * 100 : 0}%`,
              }}
            />
          </button>
        ))}
      </div>
      <span className="shrink-0 font-mono text-xl text-white/65">
        {activeIndex + 1}/{sceneKeys.length}
      </span>
      <span className="min-w-[11ch] shrink-0 text-right font-mono text-xl text-white/85">
        {formatTime(totalElapsed)} / {formatTime(totalDuration)}
      </span>
    </>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  const controls = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!controls.paused) return;
    const animations = document
      .getAnimations()
      .filter((animation) => animation.playState === 'running');
    animations.forEach((animation) => animation.pause());
    return () => animations.forEach((animation) => animation.play());
  }, [controls.paused]);

  const handleJumpTo = useCallback(
    (index: number) => {
      controls.jumpTo(index);
      const [title, file] = SCENE_DETAILS[index];
      window.parent.postMessage(
        {
          type: 'REPLIT_VIDEO_SCENE_SELECTED',
          payload: {
            sceneIndex: index,
            sceneCount: controls.sceneKeys.length,
            sceneTitle: title,
            filePath: `src/components/video/video_scenes/${file}`,
            lineNumber: 1,
          },
        },
        '*',
      );
    },
    [controls],
  );

  if (!isIframed) return <VideoTemplate />;
  const visible = !collapsed || hovering;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <VideoTemplate
        key={controls.mountKey}
        durations={controls.durations}
        paused={controls.paused}
        muted={muted}
        onSceneChange={controls.onSceneChange}
      />
      <div
        className="absolute inset-x-0 bottom-0 z-50 flex h-1/4 flex-col justify-end"
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
      >
        <div className="flex-1" />
        <div
          className={`flex items-center gap-3 bg-black/55 px-5 py-4 backdrop-blur-md transition-all ${
            visible
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-full opacity-0'
          }`}
        >
          <button
            type="button"
            onClick={controls.togglePause}
            className="flex h-14 w-14 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={controls.paused ? 'Play' : 'Pause'}
          >
            {controls.paused ? <Play size={32} /> : <Pause size={32} />}
          </button>
          <button
            type="button"
            onClick={controls.toggleLock}
            className={`flex h-14 w-14 items-center justify-center rounded-lg ${
              controls.locked ? 'bg-white/15 text-white' : 'text-white/70'
            }`}
            aria-label="Loop current scene"
            aria-pressed={controls.locked}
          >
            <Repeat size={32} />
          </button>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="flex h-14 w-14 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={32} /> : <Volume2 size={32} />}
          </button>
          <div className="h-12 w-px bg-white/15" />
          <PlaybackStatus
            {...controls}
            onJumpTo={handleJumpTo}
          />
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex h-14 w-14 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            aria-label={collapsed ? 'Show controls' : 'Hide controls'}
          >
            {collapsed ? <ChevronUp size={40} /> : <ChevronDown size={40} />}
          </button>
        </div>
      </div>
    </div>
  );
}