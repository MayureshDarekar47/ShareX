import { supabase } from '../api/supabase';
import { Device, ActiveTransfer } from '../types';

export interface SupabasePairRequest {
  deviceId: string;
  name: string;
  os: string;
  type: string;
}

export interface SupabaseSharedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  senderName: string;
  senderId: string;
  timestamp: number;
}

export class SupabaseService {
  private channel: any = null;
  private networkChannel: any = null;
  private currentPin: string = '';
  private currentNetworkId: string = 'sharex_mesh_room';

  generatePin(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // ── Network Peer Discovery ──
  async getNetworkId(): Promise<string> {
    // We use a shared mesh channel so devices always connect reliably
    // even if one is on IPv4 and another on IPv6
    return 'sharex_mesh_room';
  }

  async joinNetworkLobby(
    _networkId: string,
    myDev: Device,
    callbacks: {
      onDevicesChange: (devices: Device[]) => void;
      onFileReceived: (file: SupabaseSharedFile) => void;
    }
  ) {
    if (this.networkChannel) {
      try {
        supabase.removeChannel(this.networkChannel);
      } catch {}
      this.networkChannel = null;
    }

    const channelName = 'sharex_mesh_room';
    this.currentNetworkId = channelName;

    this.networkChannel = supabase.channel(channelName, {
      config: {
        presence: { key: myDev.id },
        broadcast: { self: false },
      },
    });

    this.networkChannel
      .on('presence', { event: 'sync' }, () => {
        const state = this.networkChannel.presenceState();
        const onlineList: Device[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key] as any[];
          if (presences && presences.length > 0 && presences[0].device) {
            onlineList.push(presences[0].device);
          }
        }
        callbacks.onDevicesChange(onlineList);
      })
      .on('broadcast', { event: 'file_sent' }, (payload: any) => {
        console.log('[Supabase Realtime] Incoming file_sent broadcast:', payload);
        const data = payload?.payload || payload;
        const file: SupabaseSharedFile = data?.file || data;
        const target = data?.targetDeviceId;

        if (file && file.url) {
          // Accept if intended for everyone, host, or this specific device
          if (!target || target === 'all' || target === 'host' || target === myDev.id) {
            callbacks.onFileReceived(file);
          }
        }
      })
      .subscribe(async (status: string) => {
        console.log(`[Supabase Realtime] Mesh channel ${channelName} status:`, status);
        if (status === 'SUBSCRIBED') {
          await this.networkChannel.track({
            device: myDev,
            onlineAt: Date.now(),
          });
        }
      });

    return this.networkChannel;
  }

  async updatePresence(updatedDev: Device) {
    if (this.networkChannel) {
      try {
        await this.networkChannel.track({
          device: updatedDev,
          onlineAt: Date.now(),
        });
      } catch (err) {
        console.warn('Failed to update presence', err);
      }
    }
  }

  // ── Host: Create a room with a 6-digit PIN ──
  createHostRoom(
    pin: string,
    hostDevice: Device,
    callbacks: {
      onPairRequest: (req: SupabasePairRequest) => void;
      onDeviceApproved?: (device: Device) => void;
      onFileReceived: (file: SupabaseSharedFile) => void;
    }
  ) {
    this.leaveRoom();
    this.currentPin = pin;

    const channelName = `sharex_room_${pin}`;
    this.channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'pair_request' }, (payload: any) => {
        const data = payload?.payload || payload;
        if (data?.device) {
          callbacks.onPairRequest(data.device);
        }
      })
      .on('broadcast', { event: 'file_sent' }, (payload: any) => {
        const data = payload?.payload || payload;
        const file: SupabaseSharedFile = data?.file || data;
        if (file && file.url) {
          callbacks.onFileReceived(file);
        }
      })
      .subscribe((status: string) => {
        console.log(`[Supabase Realtime] Host room ${pin} status:`, status);
      });

    return this.channel;
  }

  // ── Client: Connect to Host using the 6-digit PIN ──
  joinRoomWithPin(
    pin: string,
    clientDevice: Device,
    callbacks: {
      onApproved: (hostInfo: { name: string }) => void;
      onRejected: () => void;
      onFileReceived: (file: SupabaseSharedFile) => void;
    }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.leaveRoom();
      this.currentPin = pin;

      const channelName = `sharex_room_${pin}`;
      this.channel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      this.channel
        .on('broadcast', { event: 'pair_approved' }, (payload: any) => {
          const data = payload?.payload || payload;
          if (data?.approved) {
            callbacks.onApproved({ name: data.hostName || 'Host' });
            resolve(true);
          } else {
            callbacks.onRejected();
            resolve(false);
          }
        })
        .on('broadcast', { event: 'file_sent' }, (payload: any) => {
          const data = payload?.payload || payload;
          const file: SupabaseSharedFile = data?.file || data;
          if (file && file.url) {
            callbacks.onFileReceived(file);
          }
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            this.channel.send({
              type: 'broadcast',
              event: 'pair_request',
              payload: { device: clientDevice },
            });
          }
        });

      setTimeout(() => {
        resolve(false);
      }, 30000);
    });
  }

  approveDevice(approved: boolean, hostName: string) {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'pair_approved',
        payload: { approved, hostName },
      });
    }
  }

  // ── Upload and Share File via Supabase Storage ──
  async shareFile(
    file: File,
    senderDevice: Device,
    targetDeviceId?: string
  ): Promise<{ success: boolean; error?: string; fileInfo?: SupabaseSharedFile }> {
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const folder = this.currentPin || 'transfers';
      const filePath = `${folder}/${Date.now()}_${sanitizedName}`;

      const { data, error } = await supabase.storage
        .from('sharex-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        console.error('Upload error:', error);
        return { success: false, error: error.message };
      }

      const { data: urlData } = supabase.storage
        .from('sharex-files')
        .getPublicUrl(filePath);

      const fileInfo: SupabaseSharedFile = {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        url: urlData.publicUrl,
        senderName: senderDevice.name,
        senderId: senderDevice.id,
        timestamp: Date.now(),
      };

      const payload = { file: fileInfo, targetDeviceId: targetDeviceId || 'all' };

      // Broadcast to Network / Mesh lobby channel
      if (this.networkChannel) {
        await this.networkChannel.send({
          type: 'broadcast',
          event: 'file_sent',
          payload,
        });
      }

      // Broadcast to PIN room if active
      if (this.channel) {
        await this.channel.send({
          type: 'broadcast',
          event: 'file_sent',
          payload,
        });
      }

      return { success: true, fileInfo };
    } catch (e: any) {
      return { success: false, error: e.message || 'File share failed' };
    }
  }

  leaveRoom() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.currentPin = '';
  }
}

export const supabaseService = new SupabaseService();
