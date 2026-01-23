import { useCallback, useEffect, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import { sound } from '@pixi/sound';
import Button from './Button';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { isTestMode } from '../../testEnv';

export default function MusicButton() {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    if (musicUrl) {
      sound.add('background', musicUrl).loop = true;
    }
  }, [musicUrl]);

  const flipSwitch = async () => {
    if (isTestMode) {
      setPlaying((prev) => !prev);
      return;
    }
    if (!musicUrl || typeof sound.exists !== 'function' || !sound.exists('background')) {
      setPlaying((prev) => !prev);
      return;
    }
    if (isPlaying) {
      sound.stop('background');
    } else {
      try {
        await sound.play('background');
      } catch (error) {
        console.warn('Failed to play background music.', error);
        return;
      }
    }
    setPlaying(!isPlaying);
  };

  const handleKeyPress = useCallback(
    (event: { key: string }) => {
      if (event.key === 'm' || event.key === 'M') {
        void flipSwitch();
      }
    },
    [flipSwitch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return (
    <>
      <Button
        onClick={() => void flipSwitch()}
        className="hidden lg:block"
        title="Play AI generated music (press m to play/mute)"
        imgUrl={volumeImg}
        dataTestId="music-toggle"
      >
        {isPlaying ? 'Mute' : 'Music'}
      </Button>
    </>
  );
}
