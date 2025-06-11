import {
  AvatarQuality,
  StreamingEvents,
  VoiceChatTransport,
  VoiceEmotion,
  StartAvatarRequest,
  STTProvider,
  ElevenLabsModel,
} from "@heygen/streaming-avatar";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn, useUnmount } from "ahooks";

import { Button } from "./Button";
import { AvatarConfig } from "./AvatarConfig";
import { AvatarVideo } from "./AvatarSession/AvatarVideo";
import { useStreamingAvatarSession } from "./logic/useStreamingAvatarSession";
import { AvatarControls } from "./AvatarSession/AvatarControls";
import { useVoiceChat } from "./logic/useVoiceChat";
import { StreamingAvatarProvider, StreamingAvatarSessionState } from "./logic";
import { LoadingIcon } from "./Icons";
import { MessageHistory } from "./AvatarSession/MessageHistory";

import { AVATARS } from "@/app/lib/constants";

// Helper function to format date in Indian Standard Time (IST)
const formatIndianTime = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  };
  
  return new Intl.DateTimeFormat('en-IN', options).format(date);
};

// Interface for tracking stream session timing
interface SessionTiming {
  id: string;         // Unique identifier for each session
  startTime: Date;    // When the stream started
  endTime?: Date;     // When the stream ended (optional as it might not have ended yet)
  duration?: number;  // Duration in milliseconds (calculated when session ends)
}

const DEFAULT_CONFIG: StartAvatarRequest = {
  quality: AvatarQuality.Low,
  avatarName: AVATARS[0].avatar_id,
  knowledgeId: undefined,
  voice: {
    rate: 1.5,
    emotion: VoiceEmotion.EXCITED,
    model: ElevenLabsModel.eleven_flash_v2_5,
  },
  language: "en",
  voiceChatTransport: VoiceChatTransport.WEBSOCKET,
  sttSettings: {
    provider: STTProvider.DEEPGRAM,
  },
};

function InteractiveAvatar() {
  const { initAvatar, startAvatar, stopAvatar, sessionState, stream } =
    useStreamingAvatarSession();
  const { startVoiceChat } = useVoiceChat();

  const [config, setConfig] = useState<StartAvatarRequest>(DEFAULT_CONFIG);
  
  // State for tracking session timing information
  const [sessionTimings, setSessionTimings] = useState<SessionTiming[]>([]);
  // Reference to track the current session ID
  const currentSessionIdRef = useRef<string | null>(null);

  const mediaStream = useRef<HTMLVideoElement>(null);

  // Helper function to generate unique session ID
  const generateSessionId = () => {
    return `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  };

  async function fetchAccessToken() {
    try {
      const response = await fetch("/api/get-access-token", {
        method: "POST",
      });
      const token = await response.text();

      console.log("Access Token:", token); // Log the token to verify

      return token;
    } catch (error) {
      console.error("Error fetching access token:", error);
      throw error;
    }
  }

  const startSessionV2 = useMemoizedFn(async (isVoiceChat: boolean) => {
    try {
      const newToken = await fetchAccessToken();
      const avatar = initAvatar(newToken);

      avatar.on(StreamingEvents.AVATAR_START_TALKING, (e) => {
        console.log("Avatar started talking", e);
      });
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, (e) => {
        console.log("Avatar stopped talking", e);
      });      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        const disconnectedTime = new Date();
        console.log(`Stream disconnected ⛔ at ${disconnectedTime.toISOString()} (IST: ${formatIndianTime(disconnectedTime)})`);
        
        // Update session timing when stream disconnects
        if (currentSessionIdRef.current) {
          setSessionTimings(prevTimings => {
            return prevTimings.map(session => {
              if (session.id === currentSessionIdRef.current) {
                // Calculate duration in milliseconds
                const duration = disconnectedTime.getTime() - session.startTime.getTime();
                console.log(`Session ${session.id} duration: ${duration}ms (${duration / 1000}s)`);
                
                // Return updated session with end time and duration
                return {
                  ...session,
                  endTime: disconnectedTime,
                  duration: duration
                };
              }
              return session;
            });
          });
          // Clear the current session ID reference
          currentSessionIdRef.current = null;
        }
      });
        avatar.on(StreamingEvents.STREAM_READY, (event) => {
        const readyTime = new Date();
        console.log(`Stream ready 🚀 at ${readyTime.toISOString()} (IST: ${formatIndianTime(readyTime)})`, event.detail);
        
        // Generate a new session ID
        const sessionId = generateSessionId();
        // Store the ID in the ref for future access
        currentSessionIdRef.current = sessionId;
        
        // Create a new session timing record
        const newSession: SessionTiming = {
          id: sessionId,
          startTime: readyTime,
        };
        
        // Add to session timings state
        setSessionTimings(prevTimings => [...prevTimings, newSession]);
        console.log(`Started new session with ID: ${sessionId}`);
      });
      avatar.on(StreamingEvents.USER_START, (event) => {
        console.log(">>>>> User started talking:", event);
      });
      avatar.on(StreamingEvents.USER_STOP, (event) => {
        console.log(">>>>> User stopped talking:", event);
      });
      avatar.on(StreamingEvents.USER_END_MESSAGE, (event) => {
        console.log(">>>>> User end message:", event);
      });
      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
        console.log(">>>>> User talking message:", event);
      });
      avatar.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event) => {
        console.log(">>>>> Avatar talking message:", event);
      });      avatar.on(StreamingEvents.AVATAR_END_MESSAGE, (event) => {
        console.log(">>>>> Avatar end message:", event);
      });

      await startAvatar(config);

      if (isVoiceChat) {
        await startVoiceChat();
      }
    } catch (error) {
      console.error("Error starting avatar session:", error);
    }
  });

  useUnmount(() => {
    stopAvatar();
  });

  useEffect(() => {
    if (stream && mediaStream.current) {
      mediaStream.current.srcObject = stream;
      mediaStream.current.onloadedmetadata = () => {
        mediaStream.current!.play();
      };
    }
  }, [mediaStream, stream]);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col rounded-xl bg-zinc-900 overflow-hidden">
        <div className="relative w-full aspect-video overflow-hidden flex flex-col items-center justify-center">
          {sessionState !== StreamingAvatarSessionState.INACTIVE ? (
            <AvatarVideo ref={mediaStream} />
          ) : (
            <AvatarConfig config={config} onConfigChange={setConfig} />
          )}
        </div>
        <div className="flex flex-col gap-3 items-center justify-center p-4 border-t border-zinc-700 w-full">
          {sessionState === StreamingAvatarSessionState.CONNECTED ? (
            <AvatarControls />
          ) : sessionState === StreamingAvatarSessionState.INACTIVE ? (
            <div className="flex flex-row gap-4">
              <Button onClick={() => startSessionV2(true)}>
                Start Voice Chat
              </Button>
              <Button onClick={() => startSessionV2(false)}>
                Start Text Chat
              </Button>
            </div>
          ) : (
            <LoadingIcon />
          )}
        </div>
      </div>
      {sessionState === StreamingAvatarSessionState.CONNECTED && (
        <MessageHistory />
      )}
      
      {/* Display session timing information */}
      {sessionTimings.length > 0 && (
        <div className="mt-4 p-4 bg-zinc-800 rounded-xl">
          <h3 className="text-lg font-medium mb-2">Session Timing History</h3>
          <div className="space-y-2">
            {sessionTimings.map(session => (              <div key={session.id} className="p-2 bg-zinc-700 rounded">
                <p><strong>Session ID:</strong> {session.id}</p>
                <p><strong>Started (UTC):</strong> {session.startTime.toISOString()}</p>
                <p><strong>Started (IST):</strong> {formatIndianTime(session.startTime)}</p>
                {session.endTime && (
                  <>
                    <p><strong>Ended (UTC):</strong> {session.endTime.toISOString()}</p>
                    <p><strong>Ended (IST):</strong> {formatIndianTime(session.endTime)}</p>
                    <p><strong>Duration:</strong> {session.duration ? `${(session.duration / 1000).toFixed(2)}s` : 'N/A'}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InteractiveAvatarWrapper() {
  return (
    <StreamingAvatarProvider basePath={process.env.NEXT_PUBLIC_BASE_API_URL}>
      <InteractiveAvatar />
    </StreamingAvatarProvider>
  );
}
