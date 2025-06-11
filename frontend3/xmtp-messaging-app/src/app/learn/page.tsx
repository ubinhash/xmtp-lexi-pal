'use client';

import React from 'react';
import { Messaging } from '../components/Messaging';
import { MessageList } from '../components/MessageList';
import { Navbar } from '../components/Navbar';

export default function LearnPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
        <div className="flex-1 overflow-y-auto">
          <MessageList />
        </div>
        <Messaging />
      </main>
    </>
  );
} 