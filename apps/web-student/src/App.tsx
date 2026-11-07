import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { joinClassSchema, type JoinClassInput } from '@speak-shine/validation-schemas';
import { Button, Card, Badge } from '@speak-shine/ui-kit';
import { Flame, ShieldCheck, Trophy, Video, Users, Sparkles, BookOpen } from 'lucide-react';

export default function App() {
  const [streak] = useState(14);
  const [streakFreeze] = useState(2);
  const [monthlyScore] = useState(840);
  const [classCodeJoined, setClassCodeJoined] = useState<string | null>('SHINE-9402');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<JoinClassInput>({
    resolver: zodResolver(joinClassSchema),
  });

  const onJoinClass = (data: JoinClassInput) => {
    setClassCodeJoined(data.classCode);
    alert(`Successfully enrolled in class ${data.classCode}!`);
    reset();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-blue-500/20">
              S
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">Speak & Shine</h1>
              <p className="text-xs text-slate-500">Student Portal (speak-shine.online)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="amber" className="flex items-center gap-1.5 py-1 px-3">
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>{streak} Days Streak</span>
            </Badge>
            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm">
              RS
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-8 text-white shadow-xl shadow-blue-600/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Today's Daily Challenge is Live</span>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">
              Ready to elevate your speech fluency today?
            </h2>
            <p className="text-blue-100 text-sm leading-relaxed">
              Record a 60-second video response to today's topic. Our AI evaluates fluency, grammar, eye contact, and CEFR level instantly.
            </p>
          </div>
          <Button variant="accent" size="lg" className="shadow-lg shadow-amber-500/30 whitespace-nowrap">
            <Video className="w-5 h-5 mr-2" />
            Start Video Recording
          </Button>
        </div>

        {/* Gamification Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500">
              <Flame className="w-6 h-6 fill-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Streak</p>
              <h3 className="text-2xl font-bold text-slate-900">{streak} Days</h3>
              <p className="text-xs text-emerald-600 mt-0.5">Top 5% continuous learners</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Streak Freezes</p>
              <h3 className="text-2xl font-bold text-slate-900">{streakFreeze} Shields</h3>
              <p className="text-xs text-slate-500 mt-0.5">Auto-protects missed days</p>
            </div>
          </Card>

          <Card className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Monthly Score</p>
              <h3 className="text-2xl font-bold text-slate-900">{monthlyScore} Pts</h3>
              <p className="text-xs text-indigo-600 mt-0.5">Rank #3 on Class Leaderboard</p>
            </div>
          </Card>
        </div>

        {/* Enrolled Class & Join Code Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-lg">My Enrolled Class</h3>
                </div>
                {classCodeJoined && <Badge variant="success">Active Enrollment</Badge>}
              </div>

              {classCodeJoined ? (
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-slate-900 text-base">Corporate Speech & Fluency Cohort</h4>
                    <p className="text-xs text-slate-500 mt-1">Trainer: Dr. Priya Mehta • Class Code: <span className="font-mono font-bold text-blue-600">{classCodeJoined}</span></p>
                  </div>
                  <Button variant="outline" size="sm">View Class Schedule</Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">You are not currently enrolled in a trainer class.</p>
              )}
            </Card>

            {/* Daily 5-Word Challenge */}
            <Card>
              <h3 className="font-bold text-slate-900 text-lg mb-2">Today's 5-Word Vocabulary Challenge</h3>
              <p className="text-xs text-slate-500 mb-4">Incorporate these words naturally into your speech to earn +20 bonus points.</p>
              <div className="flex flex-wrap gap-2">
                {['Articulate', 'Meticulous', 'Resilience', 'Serenity', 'Endeavor'].map((word) => (
                  <span key={word} className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                    {word}
                  </span>
                ))}
              </div>
            </Card>
          </div>

          {/* Join with Class Code (Zod Validated Form) */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Join a Class</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Enter the Class ID / Invite Code provided by your trainer (e.g. SHINE-8092).
            </p>

            <form onSubmit={handleSubmit(onJoinClass)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Class Code</label>
                <input
                  {...register('classCode')}
                  type="text"
                  placeholder="SHINE-XXXX"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
                {errors.classCode && (
                  <p className="text-xs text-rose-500 mt-1 font-medium">{errors.classCode.message}</p>
                )}
              </div>

              <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
                Join Class
              </Button>
            </form>
          </Card>
        </div>
      </main>
    </div>
  );
}
