/**
 * WebRTC P2P File & Text Transfer Service (ShareMe / AirDrop style)
 * Direct device-to-device transfers over Local Wi-Fi / LAN with zero file size limits.
 */

import { supabaseService } from './supabaseService';
import { Device, ActiveTransfer } from '../types';

const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk for high throughput
const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024; // 8 MB backpressure threshold

interface PeerConnectionState {
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  targetDeviceId: string;
}

export class WebRTCService {
  private peers: Map<string, PeerConnectionState> = new Map();
  private myDevice: Device | null = null;
  private onTransferProgress?: (progress: {
    transferId: string;
    bytesTransferred: number;
    totalBytes: number;
    speed: number;
  }) => void;
  private onFileReceived?: (file: {
    name: string;
    size: number;
    url: string;
    senderName: string;
  }) => void;
  private onTextReceived?: (text: string, senderName: string) => void;

  // Track incoming file chunks
  private receivingFiles: Map<
    string,
    {
      name: string;
      size: number;
      mimeType: string;
      senderName: string;
      receivedBytes: number;
      chunks: ArrayBuffer[];
      startTime: number;
    }
  > = new Map();

  init(
    myDev: Device,
    handlers: {
      onTransferProgress?: (p: any) => void;
      onFileReceived?: (f: any) => void;
      onTextReceived?: (t: string, sender: string) => void;
    }
  ) {
    this.myDevice = myDev;
    this.onTransferProgress = handlers.onTransferProgress;
    this.onFileReceived = handlers.onFileReceived;
    this.onTextReceived = handlers.onTextReceived;
  }

  // Handle incoming signaling message from Supabase Realtime broadcast
  async handleSignalingMessage(msg: {
    type: 'offer' | 'answer' | 'candidate';
    fromDeviceId: string;
    toDeviceId: string;
    data: any;
  }) {
    if (!this.myDevice || msg.toDeviceId !== this.myDevice.id) return;

    const fromId = msg.fromDeviceId;

    if (msg.type === 'offer') {
      const pc = this.getOrCreatePeerConnection(fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await supabaseService.sendWebRTCSignal({
        type: 'answer',
        fromDeviceId: this.myDevice.id,
        toDeviceId: fromId,
        data: answer,
      });
    } else if (msg.type === 'answer') {
      const peer = this.peers.get(fromId);
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.data));
      }
    } else if (msg.type === 'candidate') {
      const peer = this.peers.get(fromId);
      if (peer && msg.data) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(msg.data));
        } catch (e) {
          console.warn('[WebRTC] Error adding ICE candidate:', e);
        }
      }
    }
  }

  private getOrCreatePeerConnection(targetDeviceId: string): RTCPeerConnection {
    const existing = this.peers.get(targetDeviceId);
    if (existing && existing.pc.connectionState !== 'closed' && existing.pc.connectionState !== 'failed') {
      return existing.pc;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
    });

    const peerState: PeerConnectionState = { pc, targetDeviceId };
    this.peers.set(targetDeviceId, peerState);

    pc.onicecandidate = (e) => {
      if (e.candidate && this.myDevice) {
        supabaseService.sendWebRTCSignal({
          type: 'candidate',
          fromDeviceId: this.myDevice.id,
          toDeviceId: targetDeviceId,
          data: e.candidate,
        });
      }
    };

    pc.ondatachannel = (e) => {
      peerState.dc = e.channel;
      this.setupDataChannel(e.channel, targetDeviceId);
    };

    return pc;
  }

  private setupDataChannel(dc: RTCDataChannel, targetDeviceId: string) {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      console.log(`[WebRTC] P2P DataChannel open with ${targetDeviceId}`);
    };

    dc.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data);
          this.handleControlMessage(msg);
        } catch {
          // Plain text message
          this.onTextReceived?.(e.data, 'Peer');
        }
      } else if (e.data instanceof ArrayBuffer) {
        this.handleBinaryChunk(e.data);
      }
    };
  }

  private currentReceivingTransferId: string | null = null;

  private handleControlMessage(msg: any) {
    if (msg.type === 'file_start') {
      this.currentReceivingTransferId = msg.transferId;
      this.receivingFiles.set(msg.transferId, {
        name: msg.name,
        size: msg.size,
        mimeType: msg.mimeType || 'application/octet-stream',
        senderName: msg.senderName || 'Peer',
        receivedBytes: 0,
        chunks: [],
        startTime: Date.now(),
      });
    } else if (msg.type === 'file_end') {
      const fileData = this.receivingFiles.get(msg.transferId);
      if (fileData) {
        const blob = new Blob(fileData.chunks, { type: fileData.mimeType });
        const url = URL.createObjectURL(blob);

        this.onFileReceived?.({
          name: fileData.name,
          size: fileData.size,
          url,
          senderName: fileData.senderName,
        });

        this.receivingFiles.delete(msg.transferId);
        this.currentReceivingTransferId = null;
      }
    } else if (msg.type === 'text_msg') {
      this.onTextReceived?.(msg.text, msg.senderName || 'Peer');
    }
  }

  private handleBinaryChunk(buffer: ArrayBuffer) {
    if (!this.currentReceivingTransferId) return;

    const fileData = this.receivingFiles.get(this.currentReceivingTransferId);
    if (!fileData) return;

    fileData.chunks.push(buffer);
    fileData.receivedBytes += buffer.byteLength;

    const elapsed = (Date.now() - fileData.startTime) / 1000;
    const speed = elapsed > 0 ? fileData.receivedBytes / elapsed : 0;

    this.onTransferProgress?.({
      transferId: this.currentReceivingTransferId,
      bytesTransferred: fileData.receivedBytes,
      totalBytes: fileData.size,
      speed,
    });
  }

  // Connect to peer over P2P DataChannel
  async connectToPeer(targetDeviceId: string): Promise<RTCDataChannel> {
    const pc = this.getOrCreatePeerConnection(targetDeviceId);
    const peer = this.peers.get(targetDeviceId)!;

    if (peer.dc && peer.dc.readyState === 'open') {
      return peer.dc;
    }

    const dc = pc.createDataChannel('sharex_file_channel', {
      ordered: true,
    });
    peer.dc = dc;
    this.setupDataChannel(dc, targetDeviceId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (this.myDevice) {
      await supabaseService.sendWebRTCSignal({
        type: 'offer',
        fromDeviceId: this.myDevice.id,
        toDeviceId: targetDeviceId,
        data: offer,
      });
    }

    // Wait up to 5 seconds for DataChannel to open
    return new Promise((resolve, reject) => {
      if (dc.readyState === 'open') {
        resolve(dc);
        return;
      }

      const timer = setTimeout(() => {
        if (dc.readyState === 'open') resolve(dc);
        else reject(new Error('P2P connection timeout'));
      }, 5000);

      dc.onopen = () => {
        clearTimeout(timer);
        resolve(dc);
      };
    });
  }

  // Send a file directly via P2P DataChannel (unlimited file size, full Wi-Fi speed)
  async sendFileP2P(
    file: File,
    targetDeviceId: string,
    onProgress?: (progress: number, speed: number) => void
  ): Promise<boolean> {
    try {
      const dc = await this.connectToPeer(targetDeviceId);
      if (dc.readyState !== 'open') return false;

      const transferId = `p2p-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      // 1. Send start header
      dc.send(
        JSON.stringify({
          type: 'file_start',
          transferId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          senderName: this.myDevice?.name || 'Peer',
        })
      );

      // 2. Stream chunks with backpressure
      let offset = 0;
      const startTime = Date.now();

      while (offset < file.size) {
        // Backpressure check
        if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        dc.send(buffer);

        offset += buffer.byteLength;
        const progress = Math.min(100, Math.round((offset / file.size) * 100));
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? offset / elapsed : 0;

        onProgress?.(progress, speed);
      }

      // 3. Send end header
      dc.send(
        JSON.stringify({
          type: 'file_end',
          transferId,
        })
      );

      return true;
    } catch (err) {
      console.warn('[WebRTC] P2P file send failed, will use cloud fallback:', err);
      return false;
    }
  }

  // Send text directly via P2P DataChannel
  async sendTextP2P(text: string, targetDeviceId: string): Promise<boolean> {
    try {
      const dc = await this.connectToPeer(targetDeviceId);
      if (dc.readyState === 'open') {
        dc.send(
          JSON.stringify({
            type: 'text_msg',
            text,
            senderName: this.myDevice?.name || 'Peer',
          })
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  isP2PAvailable(targetDeviceId: string): boolean {
    const peer = this.peers.get(targetDeviceId);
    return !!peer && peer.dc?.readyState === 'open';
  }
}

export const webrtcService = new WebRTCService();
