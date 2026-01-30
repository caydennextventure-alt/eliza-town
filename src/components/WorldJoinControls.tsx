import { useMemo, useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { toast } from 'react-toastify';
import { api } from 'convex/_generated/api';
import Button from '../ui/buttons/Button';
import takeOverImg from '../../assets/ui/icon-takeover.svg';
import { waitForInput } from '../hooks/sendInput';
import { useServerGame } from '../hooks/serverGame';
import { useCharacters } from '../lib/characterRegistry';
import JoinWorldDialog from './JoinWorldDialog';
import { Id } from '../../convex/_generated/dataModel';

type Props = {
  worldId?: Id<'worlds'>;
  onCreateAgent?: () => void;
};

export default function WorldJoinControls({ worldId, onCreateAgent }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const game = useServerGame(worldId);
  const { characters } = useCharacters();
  const humanTokenIdentifier = useQuery(api.world.userStatus, worldId ? { worldId } : 'skip');
  const userPlayerId =
    game && humanTokenIdentifier
      ? [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id
      : undefined;
  const isPlaying = !!userPlayerId;
  const takeOverAgent = useMutation(api.world.takeOverAgent);
  const leaveWorld = useMutation(api.world.leaveWorld);
  const convex = useConvex();

  const characterByName = useMemo(
    () => new Map(characters.map((character) => [character.name, character] as const)),
    [characters],
  );

  const takeoverAgents = useMemo(() => {
    if (!game) return [];
    const userToken =
      humanTokenIdentifier && humanTokenIdentifier !== 'skip' ? humanTokenIdentifier : null;
    return [...game.world.agents.values()].flatMap((agent) => {
      const agentDescription = game.agentDescriptions.get(agent.id);
      if (!agentDescription || agentDescription.isCustom !== true) return [];
      if (userToken && agentDescription.ownerId && agentDescription.ownerId !== userToken) {
        return [];
      }
      const playerDescription = game.playerDescriptions.get(agent.playerId);
      if (!playerDescription) return [];
      const character = characterByName.get(playerDescription.character);
      if (!character) return [];
      return [
        {
          agentId: agent.id,
          name: playerDescription.name,
          character,
        },
      ];
    });
  }, [game, characterByName, humanTokenIdentifier]);

  const handleTakeOver = async (agentId: string) => {
    if (!worldId) {
      toast.error('World is not ready yet.');
      return;
    }
    setIsJoining(true);
    try {
      const inputId = await takeOverAgent({ worldId, agentId });
      await waitForInput(convex, inputId);
      setDialogOpen(false);
    } catch (error: any) {
      if (error instanceof ConvexError) {
        toast.error(String(error.data));
      } else {
        toast.error(error?.message ?? 'Failed to take over agent.');
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!worldId) {
      return;
    }
    setIsLeaving(true);
    try {
      const inputId = await leaveWorld({ worldId });
      if (inputId) {
        await waitForInput(convex, inputId);
      }
    } catch (error: any) {
      if (error instanceof ConvexError) {
        toast.error(String(error.data));
      } else {
        toast.error(error?.message ?? 'Failed to leave.');
      }
    } finally {
      setIsLeaving(false);
    }
  };

  const isBusy = isJoining || isLeaving;
  const isDisabled = !worldId || game === undefined || isBusy;
  const onClick = () => {
    if (isDisabled) return;
    if (isPlaying) {
      void handleLeave();
    } else {
      setDialogOpen(true);
    }
  };

  return (
    <>
      <Button
        imgUrl={takeOverImg}
        onClick={onClick}
        className={isDisabled ? 'opacity-50 pointer-events-none' : undefined}
        dataTestId="join-world"
      >
        {isPlaying ? (isLeaving ? 'Releasing...' : 'Release') : 'Take Over'}
      </Button>
      <JoinWorldDialog
        isOpen={dialogOpen}
        isJoining={isJoining}
        onClose={() => setDialogOpen(false)}
        onTakeOver={handleTakeOver}
        onCreateAgent={onCreateAgent}
        agents={takeoverAgents}
      />
    </>
  );
}
