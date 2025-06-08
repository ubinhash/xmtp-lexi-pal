import { useEffect, useState } from 'react';
import { useXMTP } from '../contexts/XMTPContext';

interface Message {
  id: string;
  content: string;
  senderAddress: string;
  sent: Date;
}

export function MessageList() {
  const { client } = useXMTP();
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!client) return;

    const loadMessages = async () => {
      try {
        const conversations = await client.conversations.list();
        const allMessages: Message[] = [];
        
        for (const conversation of conversations) {
          const conversationMessages = await conversation.messages();
          allMessages.push(...conversationMessages.map(msg => ({
            id: msg.id,
            content: msg.content,
            senderAddress: msg.senderAddress,
            sent: msg.sent
          })));
        }

        // Sort messages by timestamp
        allMessages.sort((a, b) => b.sent.getTime() - a.sent.getTime());
        setMessages(allMessages);
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    };

    loadMessages();
  }, [client]);

  if (!client) {
    return <div className="p-4 text-gray-500">Connect your wallet to view messages</div>;
  }

  return (
    <div className="flex flex-col space-y-4 p-4">
      {messages.length === 0 ? (
        <div className="text-gray-500">No messages yet</div>
      ) : (
        messages.map((message) => (
          <div key={message.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="text-sm font-medium text-gray-900">
                {message.senderAddress.slice(0, 6)}...{message.senderAddress.slice(-4)}
              </div>
              <div className="text-xs text-gray-500">
                {message.sent.toLocaleString()}
              </div>
            </div>
            <div className="text-gray-700">{message.content}</div>
          </div>
        ))
      )}
    </div>
  );
} 