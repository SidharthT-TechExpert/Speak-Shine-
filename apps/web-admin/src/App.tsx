import React, { useState } from 'react';
import { Button, Card, Badge } from '@speak-shine/ui-kit';
import { Shield, Check, X, Users, BookOpen, Wallet, Activity, AlertCircle } from 'lucide-react';

export default function App() {
  const [trainers, setTrainers] = useState([
    {
      id: '1',
      name: 'Dr. Priya Mehta',
      email: 'priya.mehta@example.com',
      phone: '+919876543210',
      qualifications: ['CELTA Certified Coach', '10+ Years Corporate Trainer'],
      status: 'PENDING_APPROVAL',
      appliedAt: '2026-11-07 09:30',
    },
    {
      id: '2',
      name: 'Sarah Jenkins',
      email: 'sarah.j@example.com',
      phone: '+919812345678',
      qualifications: ['IELTS Examiner', 'MA Linguistics'],
      status: 'PENDING_APPROVAL',
      appliedAt: '2026-11-07 10:15',
    },
  ]);

  const handleApprove = (id: string, name: string) => {
    setTrainers((prev) => prev.filter((t) => t.id !== id));
    alert(`Trainer "${name}" has been approved! Activation email dispatched.`);
  };

  const handleReject = (id: string, name: string) => {
    setTrainers((prev) => prev.filter((t) => t.id !== id));
    alert(`Trainer "${name}" application rejected.`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Admin Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-rose-600/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-white leading-tight">Master Governance Portal</h1>
              <p className="text-xs text-slate-400">admin.speak-shine.online</p>
            </div>
          </div>
          <Badge variant="danger" className="py-1 px-3">
            SuperAdmin Mode
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2 text-blue-400">
              <Users className="w-5 h-5" />
              <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">Total Students</span>
            </div>
            <h3 className="text-3xl font-black text-white">1,420</h3>
            <p className="text-xs text-emerald-400 mt-1">+12% this week</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2 text-amber-400">
              <AlertCircle className="w-5 h-5" />
              <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">Pending Approvals</span>
            </div>
            <h3 className="text-3xl font-black text-amber-400">{trainers.length}</h3>
            <p className="text-xs text-slate-400 mt-1">Requires KYC review</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2 text-indigo-400">
              <BookOpen className="w-5 h-5" />
              <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">Active Classes</span>
            </div>
            <h3 className="text-3xl font-black text-white">48</h3>
            <p className="text-xs text-slate-400 mt-1">Across 18 Trainers</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2 text-emerald-400">
              <Wallet className="w-5 h-5" />
              <span className="text-xs uppercase font-semibold tracking-wider text-slate-400">Master Escrow</span>
            </div>
            <h3 className="text-3xl font-black text-emerald-400">₹84,500</h3>
            <p className="text-xs text-slate-400 mt-1">Platform Ledger Balanced</p>
          </div>
        </div>

        {/* Trainer Approval Queue */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Trainer Onboarding & Approval Queue</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Review applicant credentials before unlocking class creation permissions.
              </p>
            </div>
            <Badge variant="amber">{trainers.length} Pending</Badge>
          </div>

          {trainers.length > 0 ? (
            <div className="divide-y divide-slate-800">
              {trainers.map((trainer) => (
                <div key={trainer.id} className="py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold text-white text-base">{trainer.name}</h4>
                      <Badge variant="warning">Awaiting Approval</Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      {trainer.email} • {trainer.phone} • Applied: {trainer.appliedAt}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {trainer.qualifications.map((q) => (
                        <span key={q} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-md">
                          {q}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReject(trainer.id, trainer.name)}
                      className="flex items-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApprove(trainer.id, trainer.name)}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 focus:ring-emerald-500"
                    >
                      <Check className="w-4 h-4" />
                      Approve Trainer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500">
              <Check className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-sm">All trainer applications have been processed!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
