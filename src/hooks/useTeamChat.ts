import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface ChatChannel {
  id: string;
  name: string;
  is_dm: boolean;
  agency_id: string;
  created_by: string | null;
  created_at: string;
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string;
  mentions: string[];
  created_at: string;
  sender?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export interface AgentProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface CreateChannelInput {
  name: string;
  description?: string;
  isPrivate?: boolean;
}

export interface ShareToChatInput {
  channelId: string;
  objectType: "lead" | "load" | "carrier" | "ai_suggestion";
  objectTitle: string;
  objectId: string;
  metadata?: Record<string, string>;
  deepLink?: string;
}

export function useTeamChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  // Get user's agency
  const { data: agencyMember } = useQuery({
    queryKey: ["agency-member", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("agency_members")
        .select("agency_id, role")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch channels
  const { data: channels = [], isLoading: channelsLoading, refetch: refetchChannels } = useQuery({
    queryKey: ["chat-channels", agencyMember?.agency_id],
    queryFn: async () => {
      if (!agencyMember?.agency_id) return [];
      
      const { data: channelData, error } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("agency_id", agencyMember.agency_id)
        .order("name");

      if (error) throw error;
      
      // If no channels exist, seed them
      if (!channelData || channelData.length === 0) {
        console.log("No channels found, seeding default channels...");
        try {
          await supabase.functions.invoke("seed-chat-channels");
          // Refetch after seeding
          const { data: seededChannels } = await supabase
            .from("chat_channels")
            .select("*")
            .eq("agency_id", agencyMember.agency_id)
            .order("name");
          return seededChannels as ChatChannel[];
        } catch (e) {
          console.error("Failed to seed channels:", e);
        }
      }
      
      return channelData as ChatChannel[];
    },
    enabled: !!agencyMember?.agency_id,
  });

  // Fetch channel memberships
  const { data: memberships = [] } = useQuery({
    queryKey: ["chat-memberships", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("chat_channel_members")
        .select("channel_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return data.map(m => m.channel_id);
    },
    enabled: !!user?.id,
  });

  // Fetch read receipts for unread counts
  const { data: readReceipts = [] } = useQuery({
    queryKey: ["chat-reads", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("chat_reads")
        .select("channel_id, last_read_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch messages for active channel
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["chat-messages", activeChannelId],
    queryFn: async () => {
      if (!activeChannelId) return [];
      
      const { data, error } = await supabase
        .from("chat_messages")
        .select(`
          *,
          sender:profiles!sender_id(id, full_name, email, avatar_url)
        `)
        .eq("channel_id", activeChannelId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return data as ChatMessage[];
    },
    enabled: !!activeChannelId,
  });

  // Fetch team members for @mentions
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members", agencyMember?.agency_id],
    queryFn: async () => {
      if (!agencyMember?.agency_id) return [];
      
      const { data, error } = await supabase
        .from("agency_members")
        .select("user_id, profiles!user_id(id, full_name, email, avatar_url)")
        .eq("agency_id", agencyMember.agency_id);

      if (error) throw error;
      return data.map(m => m.profiles).filter(Boolean) as AgentProfile[];
    },
    enabled: !!agencyMember?.agency_id,
  });

  // Calculate unread counts per channel
  const channelsWithUnread = channels.map(channel => {
    const membership = memberships.includes(channel.id);
    if (!membership) return { ...channel, unread_count: 0 };
    
    const readReceipt = readReceipts.find(r => r.channel_id === channel.id);
    // For now, return 0 - we'll compute real counts with a dedicated query if needed
    return { ...channel, unread_count: 0 };
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ body, mentions }: { body: string; mentions: string[] }) => {
      if (!activeChannelId || !user) throw new Error("No active channel");

      const { data, error } = await supabase.functions.invoke("chat-send-message", {
        body: { channel_id: activeChannelId, body, mentions },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] });
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create channel mutation
  const createChannelMutation = useMutation({
    mutationFn: async ({ name, description, isPrivate }: CreateChannelInput) => {
      if (!agencyMember?.agency_id || !user?.id) throw new Error("Not authenticated");

      // Create channel
      const { data: channel, error: channelError } = await supabase
        .from("chat_channels")
        .insert({
          name: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
          agency_id: agencyMember.agency_id,
          created_by: user.id,
          is_dm: false,
        })
        .select()
        .single();

      if (channelError) throw channelError;

      // Auto-join creator
      await supabase.from("chat_channel_members").insert({
        channel_id: channel.id,
        user_id: user.id,
        role: "admin",
      });

      return channel;
    },
    onSuccess: (channel) => {
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat-memberships"] });
      toast({
        title: "Channel created",
        description: `#${channel.name} is ready to use`,
      });
      // Auto-select the new channel
      setActiveChannelId(channel.id);
    },
    onError: (error) => {
      toast({
        title: "Failed to create channel",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create DM / Group Chat mutation
  const createDmMutation = useMutation({
    mutationFn: async ({ userIds, groupName }: { userIds: string[]; groupName?: string }) => {
      if (!agencyMember?.agency_id || !user?.id) throw new Error("Not authenticated");
      if (userIds.length === 0) throw new Error("No users selected");

      const isGroup = userIds.length > 1;

      // For 1:1 DMs, check if one already exists
      if (!isGroup) {
        const targetUserId = userIds[0];
        const { data: existingDms } = await supabase
          .from("chat_channels")
          .select(`
            id,
            name,
            chat_channel_members!inner(user_id)
          `)
          .eq("agency_id", agencyMember.agency_id)
          .eq("is_dm", true);

        // Find existing DM with exactly these 2 users
        const existingDm = existingDms?.find(dm => {
          const members = dm.chat_channel_members as { user_id: string }[];
          const memberIds = members.map(m => m.user_id);
          return memberIds.length === 2 && memberIds.includes(user.id) && memberIds.includes(targetUserId);
        });

        if (existingDm) {
          return { id: existingDm.id, name: existingDm.name, isExisting: true, isGroup: false };
        }
      }

      // Get profiles for naming
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      // Generate channel name
      let channelName: string;
      if (isGroup && groupName) {
        channelName = groupName;
      } else if (isGroup) {
        // Use first names of members for group name
        const names = profiles?.map(p => p.full_name?.split(" ")[0] || p.email?.split("@")[0] || "User") || [];
        channelName = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
      } else {
        const profile = profiles?.[0];
        channelName = profile?.full_name || profile?.email?.split("@")[0] || "DM";
      }

      // Create channel
      const { data: channel, error: channelError } = await supabase
        .from("chat_channels")
        .insert({
          name: channelName,
          agency_id: agencyMember.agency_id,
          created_by: user.id,
          is_dm: true, // Both DMs and group chats use is_dm=true (private conversations)
        })
        .select()
        .single();

      if (channelError) throw channelError;

      // Add all members including current user
      const memberInserts = [
        { channel_id: channel.id, user_id: user.id, role: "admin" },
        ...userIds.map(uid => ({ channel_id: channel.id, user_id: uid, role: "member" })),
      ];

      await supabase.from("chat_channel_members").insert(memberInserts);

      return { ...channel, isExisting: false, isGroup };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["chat-channels"] });
      queryClient.invalidateQueries({ queryKey: ["chat-memberships"] });
      if (!result.isExisting) {
        toast({
          title: result.isGroup ? "Group created" : "Conversation started",
          description: result.isGroup ? `Group "${result.name}" is ready` : `Chat with ${result.name}`,
        });
      }
      setActiveChannelId(result.id);
    },
    onError: (error) => {
      toast({
        title: "Failed to create conversation",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Share to chat mutation
  const shareToChatMutation = useMutation({
    mutationFn: async ({ channelId, objectType, objectTitle, objectId, metadata, deepLink }: ShareToChatInput) => {
      if (!user) throw new Error("Not authenticated");

      // Build rich message
      const typeLabels: Record<string, string> = {
        lead: "📞 Lead",
        load: "📦 Load",
        carrier: "🚛 Carrier",
        ai_suggestion: "🤖 AI Suggestion",
      };

      let body = `**${typeLabels[objectType] || objectType}**: ${objectTitle}\n`;
      
      if (metadata) {
        const metaLines = Object.entries(metadata)
          .map(([key, val]) => `• ${key}: ${val}`)
          .join("\n");
        body += `${metaLines}\n`;
      }
      
      if (deepLink) {
        body += `🔗 [View Details](${deepLink})`;
      }

      const { data, error } = await supabase.functions.invoke("chat-send-message", {
        body: { channel_id: channelId, body, mentions: [] },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
      toast({
        title: "Shared to chat",
        description: "Message posted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to share",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mark channel as read
  const markAsRead = useCallback(async (channelId: string) => {
    if (!user?.id) return;

    await supabase
      .from("chat_reads")
      .upsert({
        channel_id: channelId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      }, {
        onConflict: "channel_id,user_id",
      });

    queryClient.invalidateQueries({ queryKey: ["chat-reads", user.id] });
  }, [user?.id, queryClient]);

  // Join channel if not a member
  const joinChannel = useCallback(async (channelId: string) => {
    if (!user?.id) return;

    await supabase
      .from("chat_channel_members")
      .upsert({
        channel_id: channelId,
        user_id: user.id,
        role: "member",
      }, {
        onConflict: "channel_id,user_id",
      });

    queryClient.invalidateQueries({ queryKey: ["chat-memberships", user.id] });
  }, [user?.id, queryClient]);

  // Set active channel with auto-join
  const selectChannel = useCallback(async (channelId: string) => {
    if (!channelId) {
      setActiveChannelId(null);
      return;
    }
    if (!memberships.includes(channelId)) {
      await joinChannel(channelId);
    }
    setActiveChannelId(channelId);
    await markAsRead(channelId);
  }, [memberships, joinChannel, markAsRead]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!activeChannelId) return;

    const channel = supabase
      .channel(`chat-messages-${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", activeChannelId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, queryClient]);

  // Realtime subscription for all channels (for unread badges)
  useEffect(() => {
    if (!agencyMember?.agency_id) return;

    const channel = supabase
      .channel("chat-messages-all")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["chat-reads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agencyMember?.agency_id, queryClient]);

  return {
    channels: channelsWithUnread,
    channelsLoading,
    messages,
    messagesLoading,
    activeChannelId,
    selectChannel,
    sendMessage: sendMessageMutation.mutate,
    isSending: sendMessageMutation.isPending,
    createChannel: createChannelMutation.mutate,
    isCreatingChannel: createChannelMutation.isPending,
    createDm: createDmMutation.mutate,
    isCreatingDm: createDmMutation.isPending,
    shareToChat: shareToChatMutation.mutate,
    isSharing: shareToChatMutation.isPending,
    teamMembers,
    markAsRead,
    agencyId: agencyMember?.agency_id,
    refetchChannels,
  };
}
