const fs = require('fs');

const run_update = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Update NegotiationCard props
  content = content.replace(
    'const NegotiationCard = ({ message, currentRole, onAccept, acceptingId }) => {',
    'const NegotiationCard = ({ message, currentRole, onAccept, onCounter, acceptingId }) => {'
  );

  // Update NegotiationCard buttons
  const oldButtons =       <div className="mt-4">
        {isLocked ? (
          <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white">
            Deal Confirmed
          </div>
        ) : isPending && !didAccept ? (
          <button
            onClick={() => onAccept(negotiation?._id)}
            disabled={isAccepting}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
          >
            {isAccepting ? 'Accepting...' : 'Accept Deal'}
          </button>
        ) : (
          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-600">
            Waiting for other party...
          </div>
        )}
      </div>;

  const newButtons =       <div className="mt-4">
        {isLocked ? (
          <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white">
            Deal Confirmed
          </div>
        ) : isPending && !didAccept ? (
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(negotiation?._id)}
              disabled={isAccepting}
              className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
            >
              {isAccepting ? 'Accepting...' : 'Accept'}
            </button>
            <button
              onClick={() => onCounter(negotiation)}
              disabled={isAccepting}
              className="flex-1 rounded-2xl bg-white border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100"
            >
              Counter
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-600">
            {negotiation?.status === 'COUNTERED' ? 'This deal was countered.' : 'Waiting for other party...'}
          </div>
        )}
      </div>;

  if (!content.includes(newButtons)) {
    content = content.replace(oldButtons, newButtons);
  }

  // Update state 
  content = content.replace(
    'const [acceptingNegotiationId, setAcceptingNegotiationId] = useState(\'\');',
    'const [acceptingNegotiationId, setAcceptingNegotiationId] = useState(\'\');\n  const [counteringNegotiationId, setCounteringNegotiationId] = useState(\'\');'
  );

  // Update mousedown close effect
  content = content.replace(
    '        setOfferDraft(createOfferDraft());\n      }\n    };',
    '        setOfferDraft(createOfferDraft());\n        setCounteringNegotiationId(\'\');\n      }\n    };'
  );

  // Update handleCreateNegotiation
  const oldCreateNeg =   const handleCreateNegotiation = async () => {
    if (!activeChatId || offerSending) return;

    const amount = Number(offerDraft.amount);
    if (!offerDraft.date || !offerDraft.time || !Number.isFinite(amount) || amount < 0) {
      window.alert('Please fill date, time, and a valid amount before sending the offer.');
      return;
    }

    setOfferSending(true);
    try {
      const res = await doctorChatApi.createNegotiation({
        chatId: activeChatId,
        date: offerDraft.date,
        time: offerDraft.time,
        amount,
        mode: offerDraft.mode,
      });

      const message = res.data;
      setMessagesByChat((prev) => ({
        ...prev,
        [activeChatId]: upsertMessageList(prev[activeChatId] || [], message),
      }));
      setChats((prev) => prev.map((chat) => (
        chat._id === activeChatId
          ? { ...chat, lastMessage: message.message, updatedAt: message.timestamp, unreadCount: 0 }
          : chat
      )));
      setIsOfferOpen(false);
      setOfferDraft(createOfferDraft());
    } catch (error) {
      console.error('Failed to create negotiation:', error);
      window.alert(error?.response?.data?.message || 'Unable to create consultation offer right now.');
    } finally {
      setOfferSending(false);
    }
  };;

  const newCreateNeg =   const handleCreateNegotiation = async () => {
    if (!activeChatId || offerSending) return;

    const amount = Number(offerDraft.amount);
    if (!offerDraft.date || !offerDraft.time || !Number.isFinite(amount) || amount < 0) {
      window.alert('Please fill date, time, and a valid amount before sending the offer.');
      return;
    }

    setOfferSending(true);
    try {
      let message;
      if (counteringNegotiationId) {
        const res = await doctorChatApi.counterNegotiation({
          negotiationId: counteringNegotiationId,
          date: offerDraft.date,
          time: offerDraft.time,
          amount,
          mode: offerDraft.mode,
        });
        message = res.data.newMessage;
        setMessagesByChat((prev) => ({
          ...prev,
          [activeChatId]: updateNegotiationInMessages(prev[activeChatId] || [], res.data.oldNegotiation),
        }));
      } else {
        const res = await doctorChatApi.createNegotiation({
          chatId: activeChatId,
          date: offerDraft.date,
          time: offerDraft.time,
          amount,
          mode: offerDraft.mode,
        });
        message = res.data;
      }

      setMessagesByChat((prev) => ({
        ...prev,
        [activeChatId]: upsertMessageList(prev[activeChatId] || [], message),
      }));
      setChats((prev) => prev.map((chat) => (
        chat._id === activeChatId
          ? { ...chat, lastMessage: message.message, updatedAt: message.timestamp, unreadCount: 0 }
          : chat
      )));
      setIsOfferOpen(false);
      setOfferDraft(createOfferDraft());
      setCounteringNegotiationId('');
    } catch (error) {
      console.error('Failed to create/counter negotiation:', error);
      window.alert(error?.response?.data?.message || 'Unable to create consultation offer right now.');
    } finally {
      setOfferSending(false);
    }
  };

  const handleCounter = (negotiation) => {
    setCounteringNegotiationId(negotiation._id);
    const d = new Date(negotiation.date);
    const dateStr = d.toISOString().split('T')[0];
    setOfferDraft({
      date: dateStr,
      time: negotiation.time,
      amount: negotiation.amount,
      mode: negotiation.mode,
    });
    setIsOfferOpen(true);
  };;

  if (!content.includes('handleCounter = (negotiation)')) {
    content = content.replace(oldCreateNeg, newCreateNeg);
  }

  // Update <NegotiationCard to include onCounter={handleCounter}
  content = content.replace(
    'onAccept={handleAcceptNegotiation}',
    'onAccept={handleAcceptNegotiation}\n                          onCounter={handleCounter}'
  );

  fs.writeFileSync(filePath, content, 'utf8');
}

run_update('c:/Users/Acer/Desktop/aivedabot/ayurveda-app/frontend_chat/src/pages/dashboard/Messages.jsx');
run_update('c:/Users/Acer/Desktop/aivedabot/doctor-portal/src/pages/Messages.jsx');
