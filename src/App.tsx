// src/App.tsx
import * as React from "react";
import ScreenShare from "./components/ScreenShare";
import { WebSocketProvider } from "./components/WebSocketProvider";
import BackgroundEffect from "./components/BackgroundEffect";

const App: React.FC = () => {
  return (
    <>
      <BackgroundEffect />
      <WebSocketProvider url="ws://127.0.0.1:9090">
        <div className="container mx-auto p-4">
          <ScreenShare />
        </div>
      </WebSocketProvider>
    </>
  );
};

export default App;