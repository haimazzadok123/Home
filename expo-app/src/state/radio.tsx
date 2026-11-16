import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { STATIONS } from '@/lib/data';

// One audio player for the whole app, so the radio keeps playing when you switch tabs.
// The player is created in an effect, never during render: on the web the first render happens on
// the server, which has no audio support.

type RadioContextValue = {
  current: number; // index into STATIONS, -1 when stopped
  playing: boolean;
  buffering: boolean;
  play: (index: number) => void;
  stop: () => void;
};

const RadioContext = createContext<RadioContextValue>({
  current: -1,
  playing: false,
  buffering: false,
  play: () => {},
  stop: () => {},
});

export function RadioProvider({ children }: { children: ReactNode }) {
  const player = useRef<AudioPlayer | null>(null);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    // Keep playing with the silent switch on and when the app goes to the background
    // (background playback needs a development build; Expo Go may stop it).
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
    const p = createAudioPlayer(null);
    player.current = p;
    const sub = p.addListener('playbackStatusUpdate', (status) => {
      setPlaying(status.playing);
      setBuffering(status.isBuffering);
    });
    return () => {
      sub.remove();
      p.remove();
      player.current = null;
    };
  }, []);

  const play = useCallback((index: number) => {
    const p = player.current;
    const station = STATIONS[index];
    if (!p || !station) return;
    setCurrent(index);
    p.replace({ uri: station.url });
    p.play();
    try {
      p.setActiveForLockScreen(true, { title: station.name, artist: 'רדיו' });
    } catch {
      // lock-screen controls are optional
    }
  }, []);

  const stop = useCallback(() => {
    const p = player.current;
    setCurrent(-1);
    if (!p) return;
    p.pause();
    try {
      p.setActiveForLockScreen(false);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ current, playing: current >= 0 && playing, buffering: current >= 0 && buffering, play, stop }),
    [current, playing, buffering, play, stop],
  );
  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export const useRadio = () => useContext(RadioContext);
