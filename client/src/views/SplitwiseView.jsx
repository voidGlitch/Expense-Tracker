import { useMemo, useState } from 'react';
import { Card, CardHeader, Button, TextInput, Select, EmptyState, Badge } from '../components/ui.jsx';
import { Users, DollarSign, Plus, UserPlus, User, HandCoins, Receipt, ArrowRight, ArrowLeft } from 'lucide-react';
import { useStore } from '../state/StoreContext.jsx';
import { formatMoney } from '../lib/money.js';
import { getSplitwiseSummary, calculatePairwiseBalances } from '@expense/shared';

// Generate a random ID
const makeId = (prefix) => `${prefix}_${Math.random().toString(36).substr(2, 9)}`;

export default function SplitwiseView() {
  const { store, apply, user } = useStore();
  const userId = user?.id || 'self';

  // Create default splitwise store if it somehow doesn't exist
  const splitwise = store.splitwise || { groups: [], friends: [], expenses: [], settlements: [] };

  const [activeTab, setActiveTab] = useState('friends');

  // Modals
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettleUp, setShowSettleUp] = useState(false);

  // Computed summary
  const summary = useMemo(() => {
    return getSplitwiseSummary(userId, splitwise.groups, splitwise.expenses, splitwise.settlements);
  }, [userId, splitwise.groups, splitwise.expenses, splitwise.settlements]);

  // Pairwise balances (who owes who)
  const balances = useMemo(() => {
    return calculatePairwiseBalances(splitwise.expenses, splitwise.settlements);
  }, [splitwise.expenses, splitwise.settlements]);

  // Render components
  return (
    <div className="space-y-6 max-w-lg mx-auto pb-20">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Splitwise
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Split expenses with friends
          </p>
        </div>
        <Button
          variant="primary"
          icon={Receipt}
          onClick={() => setShowAddExpense(true)}
        >
          Add Expense
        </Button>
        <Button
          className="ml-2 bg-emerald-600 text-white hover:bg-emerald-500 rounded-xl px-4 py-2.5 text-sm font-semibold"
          icon={HandCoins}
          onClick={() => setShowSettleUp(true)}
        >
          Settle Up
        </Button>
      </header>

      {/* DASHBOARD SUMMARIES */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center flex flex-col items-center justify-center">
          <span className="text-xs text-slate-500 mb-1">Total balance</span>
          <span className={`text-lg font-bold ${summary.netBalance > 0 ? 'text-emerald-500' : summary.netBalance < 0 ? 'text-rose-500' : 'text-slate-700'}`}>
            {summary.netBalance > 0 ? '+' : ''}{formatMoney(summary.netBalance)}
          </span>
        </Card>
        <Card className="p-3 text-center flex flex-col items-center justify-center">
          <span className="text-xs text-slate-500 mb-1">You owe</span>
          <span className="text-lg font-bold text-rose-500">
            {formatMoney(summary.totalYouOwe)}
          </span>
        </Card>
        <Card className="p-3 text-center flex flex-col items-center justify-center">
          <span className="text-xs text-slate-500 mb-1">You are owed</span>
          <span className="text-lg font-bold text-emerald-500">
            {formatMoney(summary.totalYouAreOwed)}
          </span>
        </Card>
      </div>

      {/* TABS */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          className={`flex-1 py-3 text-sm font-medium border-b-2 ${activeTab === 'friends' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500'}`}
          onClick={() => setActiveTab('friends')}
        >
          Friends
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium border-b-2 ${activeTab === 'groups' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500'}`}
          onClick={() => setActiveTab('groups')}
        >
          Groups
        </button>
        <button
          className={`flex-1 py-3 text-sm font-medium border-b-2 ${activeTab === 'activity' ? 'border-primary-500 text-primary-600' : 'border-transparent text-slate-500'}`}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'friends' && (
        <FriendsList
          friends={splitwise.friends}
          balances={balances}
          userId={userId}
          onAdd={() => setShowAddFriend(true)}
        />
      )}

      {activeTab === 'groups' && (
        <GroupsList
          groups={splitwise.groups}
          onAdd={() => setShowAddGroup(true)}
        />
      )}

      {activeTab === 'activity' && (
        <ActivityFeed
          expenses={splitwise.expenses}
          settlements={splitwise.settlements}
          friends={splitwise.friends}
          groups={splitwise.groups}
          userId={userId}
        />
      )}

      {/* MODALS */}
      {showAddFriend && (
        <AddFriendModal
          onClose={() => setShowAddFriend(false)}
          apply={apply}
        />
      )}

      {showAddGroup && (
        <AddGroupModal
          onClose={() => setShowAddGroup(false)}
          friends={splitwise.friends}
          apply={apply}
          userId={userId}
        />
      )}

      {showAddExpense && (
        <AddExpenseModal
          onClose={() => setShowAddExpense(false)}
          friends={splitwise.friends}
          groups={splitwise.groups}
          apply={apply}
          userId={userId}
        />
      )}

      {showSettleUp && (
        <SettleUpModal
          onClose={() => setShowSettleUp(false)}
          friends={splitwise.friends}
          apply={apply}
          userId={userId}
        />
      )}
    </div>
  );
}

// ----- TAB COMPONENTS -----

function FriendsList({ friends, balances, userId, onAdd }) {
  if (friends.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No friends yet"
        description="Add friends to start splitting bills with them."
        action={<Button variant="primary" onClick={onAdd}>Add Friend</Button>}
      />
    );
  }

  // Calculate friends with balances
  const friendsWithBalances = friends.map(f => {
    // Find if you owe them or they owe you
    const oweThem = balances.find(b => b.from === userId && b.to === f.id)?.amount || 0;
    const owedByThem = balances.find(b => b.from === f.id && b.to === userId)?.amount || 0;

    // Net it out (since balances should be simplified, usually only one is > 0)
    const net = owedByThem - oweThem;

    return { ...f, netBalance: net };
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-sm font-semibold text-slate-700">Your Friends</h2>
        <Button size="sm" variant="ghost" icon={UserPlus} onClick={onAdd}>Add</Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {friendsWithBalances.map(friend => (
          <div key={friend.id} className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
                {friend.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-slate-900 dark:text-slate-100">{friend.name}</span>
            </div>

            <div className="text-right flex flex-col">
              {friend.netBalance === 0 ? (
                <span className="text-sm text-slate-400">Settled up</span>
              ) : friend.netBalance > 0 ? (
                <>
                  <span className="text-xs text-emerald-600">owes you</span>
                  <span className="text-sm font-bold text-emerald-600">{formatMoney(friend.netBalance)}</span>
                </>
              ) : (
                <>
                  <span className="text-xs text-rose-500">you owe</span>
                  <span className="text-sm font-bold text-rose-500">{formatMoney(Math.abs(friend.netBalance))}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupsList({ groups, onAdd }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No groups yet"
        description="Create groups for trips or apartments."
        action={<Button variant="primary" onClick={onAdd}>Start Group</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-sm font-semibold text-slate-700">Your Groups</h2>
        <Button size="sm" variant="ghost" icon={Plus} onClick={onAdd}>New</Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {groups.map(group => (
          <div key={group.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-500 flex items-center justify-center flex-shrink-0">
                <Users size={20} />
              </div>
              <span className="font-medium text-slate-900 dark:text-slate-100">{group.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityFeed({ expenses, settlements, friends, userId, groups }) {
  const allEvents = [
    ...expenses.map(e => ({ ...e, type: 'expense', timestamp: new Date(e.date).getTime() })),
    ...settlements.map(s => ({ ...s, type: 'settlement', timestamp: new Date(s.date).getTime() }))
  ].sort((a, b) => b.timestamp - a.timestamp);

  const getFriendName = (id) => {
    if (id === userId) return 'You';
    return friends.find(f => f.id === id)?.name || id;
  };

  const getGroupName = (id) => {
    if (!id) return '';
    return groups.find(g => g.id === id)?.name || '';
  };

  if (allEvents.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No activity yet"
        description="Expenses and settlements will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {allEvents.map(event => (
          <div key={event.id} className="p-4 flex gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
              ${event.type === 'expense' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}
            >
              {event.type === 'expense' ? <Receipt size={20} /> : <HandCoins size={20} />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {event.type === 'expense' ? event.description : 'Payment'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {getFriendName(event.type === 'expense' ? event.paidBy : event.from)}
                    {event.type === 'expense' ? ' paid ' : ' paid '}
                    {event.type === 'settlement' && getFriendName(event.to)}
                    {event.groupId && ` in ${getGroupName(event.groupId)}`}
                  </p>
                </div>
                <span className="font-semibold text-sm">
                  {formatMoney(event.amount)}
                </span>
              </div>

              {/* Show participation for user if expense */}
              {event.type === 'expense' && (
                <div className="mt-2 text-xs">
                  {event.paidBy === userId ? (
                    <span className="text-emerald-600">You lent {formatMoney(event.amount - (event.splits.find(s => s.memberId === userId)?.amount || 0))}</span>
                  ) : event.splits.some(s => s.memberId === userId) ? (
                    <span className="text-rose-500">You borrowed {formatMoney(event.splits.find(s => s.memberId === userId)?.amount)}</span>
                  ) : (
                    <span className="text-slate-400">Not involved</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- MODAL COMPONENTS -----

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-500 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function AddFriendModal({ onClose, apply }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;

    apply(store => {
      const sw = store.splitwise || { groups: [], friends: [], expenses: [], settlements: [] };
      return {
        ...store,
        splitwise: {
          ...sw,
          friends: [...sw.friends, { id: makeId('usr'), name: name.trim(), email: email.trim() }]
        }
      };
    });
    onClose();
  };

  return (
    <Modal title="Add Friend" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <TextInput
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Jane Doe"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Email (optional)</label>
          <TextInput
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
        <Button variant="primary" className="w-full mt-6" onClick={handleSave} disabled={!name.trim()}>
          Add Friend
        </Button>
      </div>
    </Modal>
  );
}

function AddGroupModal({ onClose, apply, friends, userId }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);

  const handleToggleMember = (id) => {
    if (members.includes(id)) {
      setMembers(members.filter(m => m !== id));
    } else {
      setMembers([...members, id]);
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;

    apply(store => {
      const sw = store.splitwise || { groups: [], friends: [], expenses: [], settlements: [] };
      return {
        ...store,
        splitwise: {
          ...sw,
          groups: [...sw.groups, {
            id: makeId('grp'),
            name: name.trim(),
            members: [userId, ...members]
          }]
        }
      };
    });
    onClose();
  };

  return (
    <Modal title="Start a Group" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Group Name</label>
          <TextInput
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Trip to Paris, Apartment, etc."
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 mt-4">Group Members</label>
          {friends.length === 0 ? (
            <div className="p-3 bg-brand-50 text-brand-700 text-sm rounded-lg">
              Add friends first to create a group.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {friends.map(friend => (
                <label key={friend.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={members.includes(friend.id)}
                    onChange={() => handleToggleMember(friend.id)}
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-600 h-4 w-4"
                  />
                  <span>{friend.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <Button variant="primary" className="w-full mt-6" onClick={handleSave} disabled={!name.trim()}>
          Create Group
        </Button>
      </div>
    </Modal>
  );
}

function AddExpenseModal({ onClose, apply, friends, groups, userId }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [groupId, setGroupId] = useState('');
  const [paidBy, setPaidBy] = useState(userId);
  const [splitType, setSplitType] = useState('equal');
  const [splitWith, setSplitWith] = useState([]); // friend IDs or participant IDs
  const [splitDetails, setSplitDetails] = useState({}); // { [memberId]: value }

  const relevantFriends = groupId
    ? friends.filter(f => groups.find(g => g.id === groupId)?.members.includes(f.id))
    : friends;

  const participants = groupId
      ? [userId, ...relevantFriends.map(f => f.id)]
      : [userId, ...splitWith];

  const handleToggleSplit = (id) => {
    if (splitWith.includes(id)) {
      setSplitWith(splitWith.filter(m => m !== id));
      const newDetails = { ...splitDetails };
      delete newDetails[id];
      setSplitDetails(newDetails);
    } else {
      setSplitWith([...splitWith, id]);
    }
  };

  const handleSave = () => {
    const numAmt = parseFloat(amount);
    if (!description.trim() || isNaN(numAmt) || numAmt <= 0) return;

    // Use engine to calculate splits
    import('@expense/shared').then(({ calculateSplits }) => {
      const splits = calculateSplits(numAmt, splitType, participants, splitDetails);

      apply(store => {
        const sw = store.splitwise || { groups: [], friends: [], expenses: [], settlements: [] };
        return {
          ...store,
          splitwise: {
            ...sw,
            expenses: [...sw.expenses, {
              id: makeId('exp'),
              description: description.trim(),
              amount: numAmt,
              date: new Date().toISOString().split('T')[0],
              paidBy,
              groupId: groupId || null,
              splits
            }]
          }
        };
      });
      onClose();
    });
  };

  return (
    <Modal title="Add an Expense" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <TextInput value={description} onChange={e => setDescription(e.target.value)} placeholder="Dinner, Groceries, etc." autoFocus />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-slate-400">₹</span>
            <TextInput type="number" className="pl-7" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Group (optional)</label>
            <Select value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Paid By</label>
            <Select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
              <option value={userId}>You</option>
              {relevantFriends.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Split Type</label>
          <Select value={splitType} onChange={e => setSplitType(e.target.value)}>
            <option value="equal">Equal</option>
            <option value="exact">Exact Amount</option>
            <option value="percentage">Percentage</option>
            <option value="shares">Shares</option>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Participants & Split Details</label>
          <div className="max-h-40 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
            {groupId ? (
              participants.map(pId => {
                const name = pId === userId ? 'You' : (friends.find(f => f.id === pId)?.name || 'Unknown');
                return <ParticipantRow key={pId} id={pId} name={name} paidBy={paidBy} splitType={splitType} details={splitDetails} setDetails={setSplitDetails} />
              })
            ) : (
                <div className="space-y-2">
                  <ParticipantRow id={userId} name="You" paidBy={paidBy} splitType={splitType} details={splitDetails} setDetails={setSplitDetails} />
                  {relevantFriends.map(friend => (
                    <div key={friend.id} className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 last:border-0 pb-2 mb-2 last:pb-0 last:mb-0">
                      <label className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer flex-1">
                        <input type="checkbox" checked={splitWith.includes(friend.id)} onChange={() => handleToggleSplit(friend.id)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
                        <span className="text-sm font-medium">{friend.name}</span>
                      </label>
                      {splitWith.includes(friend.id) && splitType !== 'equal' && (
                        <TextInput type="number" className="w-24 text-right" placeholder={splitType} value={splitDetails[friend.id] || ''} onChange={e => setSplitDetails({...splitDetails, [friend.id]: e.target.value})} />
                      )}
                    </div>
                  ))}
                </div>
            )}
          </div>
        </div>

        <Button variant="primary" className="w-full mt-6" onClick={handleSave} disabled={!description.trim() || !amount}>
          Save Expense
        </Button>
      </div>
    </Modal>
  );
}

function ParticipantRow({ id, splitType, details, setDetails, name }) {
  return (
    <div className="flex items-center gap-3 p-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="flex-1 text-sm font-medium">{name}</span>
      {splitType !== 'equal' && (
        <TextInput type="number" className="w-24 text-right" placeholder={splitType} value={details[id] || ''} onChange={e => setDetails({...details, [id]: e.target.value})} />
      )}
    </div>
  );
}

function SettleUpModal({ onClose, apply, friends, userId }) {
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');

  const handleSave = () => {
    const numAmt = parseFloat(amount);
    if (isNaN(numAmt) || numAmt <= 0 || !paidTo) return;

    apply(store => {
      const sw = store.splitwise || { groups: [], friends: [], expenses: [], settlements: [] };
      return {
        ...store,
        splitwise: {
          ...sw,
          settlements: [...sw.settlements, {
            id: makeId('set'),
            amount: numAmt,
            date: new Date().toISOString().split('T')[0],
            from: userId,
            to: paidTo
          }]
        }
      };
    });
    onClose();
  };

  return (
    <Modal title="Settle Up" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">You paid</label>
          <Select value={paidTo} onChange={e => setPaidTo(e.target.value)}>
            <option value="">Select friend...</option>
            {friends.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400">₹</span>
              <TextInput type="number" className="pl-7" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
        </div>
        <Button className="w-full mt-6 bg-emerald-600 text-white hover:bg-emerald-500" onClick={handleSave} disabled={!paidTo || !amount}>
          Record Settlement
        </Button>
      </div>
    </Modal>
  );
}
