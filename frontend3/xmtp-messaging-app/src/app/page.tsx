'use client';

import React from 'react';
import { Messaging } from './components/Messaging';
import { MessageList } from './components/MessageList';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="flex-1 overflow-y-auto">
        <MessageList />
      </div>
      <Messaging />
    </main>
  );
}
