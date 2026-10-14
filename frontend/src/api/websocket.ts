import { useEffect, useRef, useCallback } from 'react';
import { WSMessage, WSMessageType } from '../types';

type MessageHandler = (msg: WSMessage) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<WSMessageType | '*', Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private url: string = '';
  private token: string = '';
  private shouldReconnect = false;

  connect(url: string, token: string): void {
    this.url = url;
    this.token = token;
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const wsUrl = `${this.url}/ws?token=${this.token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.emit({ type: 'ping', payload: {}, timestamp: Date.now() } as any);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        this.dispatch(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.doConnect();
    }, this.reconnectDelay);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  send(msg: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  emit(msg: WSMessage): void {
    this.send(msg);
  }

  private dispatch(msg: WSMessage): void {
    const specific = this.handlers.get(msg.type);
    specific?.forEach((h) => h(msg));
    const wildcard = this.handlers.get('*');
    wildcard?.forEach((h) => h(msg));
  }

  on(type: WSMessageType | '*', handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WSClient();

export function useWebSocket(
  type: WSMessageType | '*',
  handler: MessageHandler,
  deps: any[] = []
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const off = wsClient.on(type, (msg) => handlerRef.current(msg));
    return off;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, ...deps]);
}
