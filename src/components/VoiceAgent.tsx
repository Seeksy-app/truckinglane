import { useConversation } from "@elevenlabs/react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface VoiceAgentProps {
  onStatusChange?: (status: string) => void;
}

export function VoiceAgent({ onStatusChange }: VoiceAgentProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to ElevenLabs agent");
      toast.success("Voice agent connected");
      onStatusChange?.("connected");
    },
    onDisconnect: () => {
      console.log("Disconnected from ElevenLabs agent");
      toast.info("Voice agent disconnected");
      onStatusChange?.("disconnected");
    },
    onMessage: (message) => {
      console.log("Message from agent:", message);
    },
    onError: (error) => {
      console.error("Voice agent error:", error);
      toast.error("Voice agent error: " + (typeof error === "string" ? error : "Unknown error"));
    },
  });

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get signed URL from our edge function
      const { data, error } = await supabase.functions.invoke(
        "elevenlabs-conversation-token"
      );

      if (error) {
        console.error("Failed to get conversation token:", error);
        throw new Error(error.message || "Failed to get conversation token");
      }

      if (!data?.signed_url) {
        console.error("No signed_url in response:", data);
        throw new Error("No signed URL received from server");
      }

      console.log("Starting conversation with signed URL");

      // Start the conversation with WebSocket
      await conversation.startSession({
        signedUrl: data.signed_url,
      });

    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start voice agent");
    } finally {
      setIsConnecting(false);
    }
  }, [conversation]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isConnected = conversation.status === "connected";

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-card border border-border">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div 
          className={`w-2 h-2 rounded-full ${
            isConnected ? "bg-green-500 animate-pulse" : "bg-muted"
          }`} 
        />
        <span>
          {isConnecting 
            ? "Connecting..." 
            : isConnected 
              ? conversation.isSpeaking 
                ? "Agent speaking..." 
                : "Listening..." 
              : "Ready to connect"
          }
        </span>
      </div>

      {!isConnected ? (
        <Button 
          onClick={startConversation} 
          disabled={isConnecting}
          size="lg"
          className="gap-2"
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Phone className="w-4 h-4" />
              Start Voice Agent
            </>
          )}
        </Button>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            {conversation.isSpeaking ? (
              <MicOff className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Mic className="w-5 h-5 text-primary animate-pulse" />
            )}
          </div>
          <Button 
            onClick={stopConversation}
            variant="destructive"
            size="lg"
            className="gap-2"
          >
            <PhoneOff className="w-4 h-4" />
            End Call
          </Button>
        </div>
      )}
    </div>
  );
}
