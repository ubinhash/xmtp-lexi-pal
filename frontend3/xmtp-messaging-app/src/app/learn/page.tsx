'use client';

import React from 'react';
import { Messaging } from '../components/Messaging';

import { Navbar } from '../components/Navbar';

export default function LearnPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50">
   
        <Messaging />
      </main>
    </>
  );
} 