import * as React from "react";
import { useRef, useState, useEffect } from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { useWebSocket } from "./WebSocketProvider";
import { Base64 } from 'js-base64';

interface ChatMessage {
  text: string;
  timestamp: string;
}

const ScreenShare: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const setupInProgressRef = useRef(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    text: "Welcome! Click 'Connect to Server' to begin.",
    timestamp: new Date().toLocaleTimeString()
  }]);
  const { sendMessage, sendMediaChunk, isConnected, playbackAudioLevel, lastMessage, connect } = useWebSocket();
  const captureIntervalRef = useRef<NodeJS.Timeout>();

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage) {
      setMessages(prev => [...prev, {
        text: lastMessage,
        timestamp: new Date().toLocaleTimeString()
      }]);
    }
  }, [lastMessage]);

  // Handle connection state changes
  useEffect(() => {
    if (isConnected) {
      setIsConnecting(false);
      setMessages(prev => [...prev, {
        text: "Connected to server successfully. You can now share your screen.",
        timestamp: new Date().toLocaleTimeString()
      }]);
    }
  }, [isConnected]);

  const handleConnect = () => {
    if (isConnected) return;
    
    setIsConnecting(true);
    setMessages(prev => [...prev, {
      text: "Connecting to server...",
      timestamp: new Date().toLocaleTimeString()
    }]);
    connect();
  };

  const startSharing = async () => {
    if (isSharing || !isConnected) return;

    try {
      // Get screen stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      
      // Get audio stream
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });

      // Set up audio context and processing
      audioContextRef.current = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });

      const ctx = audioContextRef.current;
      await ctx.audioWorklet.addModule('/worklets/audio-processor.js');
      
      const source = ctx.createMediaStreamSource(audioStream);
      audioWorkletNodeRef.current = new AudioWorkletNode(ctx, 'audio-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        processorOptions: {
          sampleRate: 16000,
          bufferSize: 4096,
        },
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers'
      });

      // Set up audio processing
      audioWorkletNodeRef.current.port.onmessage = (event) => {
        const { pcmData, level } = event.data;
        setAudioLevel(level);
        
        if (pcmData) {
          const base64Data = Base64.fromUint8Array(new Uint8Array(pcmData));
          sendMediaChunk({
            mime_type: "audio/pcm",
            data: base64Data
          });
        }
      };

      source.connect(audioWorkletNodeRef.current);
      audioStreamRef.current = audioStream;

      // Set up video stream and capture
      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
        
        // Start screen capture interval
        captureIntervalRef.current = setInterval(() => {
          if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0);
              const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
              
              sendMediaChunk({
                mime_type: "image/jpeg",
                data: imageData
              });
            }
          }
        }, 3000);
      }

      // Send initial setup message
      sendMessage({
        setup: {
          // Add any needed config options
        }
      });

      setIsSharing(true);
    } catch (err) {
      console.error('Failed to start sharing:', err);
      stopSharing();
    }
  };

  const stopSharing = () => {
    // Stop video stream
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    // Stop audio stream
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    // Stop screen capture interval
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = undefined;
    }

    // Clean up audio processing
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsSharing(false);
    setAudioLevel(0);
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-3xl">
      {/* Welcome Header */}
      <div className="text-center space-y-2">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl text-white">
          Welcome to AI Screen Sharing Assistant
        </h1>
        <p className="text-xl text-gray-200">
          Share your screen and talk to me
        </p>
      </div>

      {/* Screen Preview */}
      <Card className="w-full md:w-[640px] mx-auto bg-white/10 backdrop-blur-sm border-white/20">
        <CardContent className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video rounded-md border border-white/20 bg-black/40"
            />
            {/* Combined Audio Level Indicator */}
            {isSharing && (
              <div className="w-full space-y-2">
                <Progress 
                  value={Math.max(audioLevel, playbackAudioLevel)} 
                  className="h-1 bg-white/20" 
                  indicatorClassName="bg-white" 
                />
              </div>
            )}
            {/* Connection/Sharing Button */}
            {!isConnected ? (
              <Button 
                size="lg" 
                onClick={handleConnect}
                disabled={isConnecting}
                className={isConnecting ? "bg-gray-500" : "bg-blue-500 hover:bg-blue-600 text-white"}
              >
                {isConnecting ? "Connecting..." : "Connect to Server"}
              </Button>
            ) : (
              !isSharing ? (
                <Button 
                  size="lg" 
                  onClick={startSharing}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  Start Screen Share
                </Button>
              ) : (
                <Button size="lg" variant="destructive" onClick={stopSharing} className="bg-red-500 hover:bg-red-600 text-white">
                  Stop Sharing
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chat History */}
      <Card className="w-full md:w-[640px] mx-auto bg-white/10 backdrop-blur-sm border-white/20">
        <CardHeader>
          <CardTitle className="text-white">Chat History</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div 
                  key={index} 
                  className="flex items-start space-x-4 rounded-lg p-4 bg-white/5 border border-white/10"
                >
                  <div className="h-8 w-8 rounded-full flex items-center justify-center bg-white text-black">
                    <span className="text-xs font-medium">AI</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm leading-loose text-gray-100">{message.text}</p>
                    <p className="text-xs text-gray-400">{message.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScreenShare;