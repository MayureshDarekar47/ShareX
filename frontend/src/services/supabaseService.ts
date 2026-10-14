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
  private currentPin: string = '';

  generatePin(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
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
        if (payload?.payload?.device) {
          callbacks.onPairRequest(payload.payload.device);
        }
      })
      .on('broadcast', { event: 'file_sent' }, (payload: any) => {
        if (payload?.payload?.file) {
          callbacks.onFileReceived(payload.payload.file);
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
          if (payload?.payload?.approved) {
            callbacks.onApproved({ name: payload.payload.hostName || 'Host' });
            resolve(true);
          } else {
            callbacks.onRejected();
            resolve(false);
          }
        })
        .on('broadcast', { event: 'file_sent' }, (payload: any) => {
          if (payload?.payload?.file) {
            callbacks.onFileReceived(payload.payload.file);
          }
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            // Send pair request to host
            this.channel.send({
              type: 'broadcast',
              event: 'pair_request',
              payload: { device: clientDevice },
            });
          }
        });

      // Timeout after 30s if no response
      setTimeout(() => {
        resolve(false);
      }, 30000);
    });
  }

  // ── Host approves device ──
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
    onProgress?: (progress: number) => void
  ): Promise<{ success: boolean; error?: string; fileInfo?: SupabaseSharedFile }> {
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${this.currentPin || 'room'}/${Date.now()}_${sanitizedName}`;

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

      // Broadcast file info to all devices in the room
      if (this.channel) {
        await this.channel.send({
          type: 'broadcast',
          event: 'file_sent',
          payload: { file: fileInfo },
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
