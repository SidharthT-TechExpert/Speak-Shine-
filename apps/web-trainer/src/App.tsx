import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClassSchema, type CreateClassInput } from '@speak-shine/validation-schemas';
import { Button, Card, Badge } from '@speak-shine/ui-kit';
import { Users, Plus, Award, Video, Calendar, ShieldCheck, CheckCircle } from 'lucide-react';

export default function App() {
  const [classes, setClasses] = useState([
    { id: '1', title: 'Morning Fluency Batch A', classCode: 'SHINE-7821', studentCount: 24, status: 'ACTIVE' },
    { id: '2', title: 'Executive Voice & Tone Cohort', classCode: 'SHINE-9402', studentCount: 18, status: 'ACTIVE' },
  ]);

  const [activeTab, setActiveTab] = useState<'classes' | 'students' | 'prizes'>('classes');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateClassInput>({
    resolver: zodResolver(createClassSchema),
  });

  const onCreateClass = (data: CreateClassInput) => {
    const randomCode = `SHINE-${Math.floor(1000 + Math.random() * 9000)}`;
    setClasses((prev) => [
      { id: Date.now().toString(), title: data.title, classCode: randomCode, studentCount: 0, status: 'ACTIVE' },
      ...prev,
    ]);
    alert(`Class "${data.title}" created with Code: ${randomCode}!`);
    reset();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-800 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-blue-600/20">
              T
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">Trainer Command Center</h1>
              <p className="text-xs text-slate-500">trainer.speak-shine.online</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="success" className="flex items-center gap-1.5 py-1 px-3">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Trainer Active & Approved</span>
            </Badge>
            <Button variant="accent" size="sm" className="flex items-center gap-1.5">
              <Video className="w-4 h-4" />
              Start Live Room
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 gap-6">
          <button
            onClick={() => setActiveTab('classes')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'classes'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            My Classes & Cohorts
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'students'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Student Rosters & Streaks
          </button>
          <button
            onClick={() => setActiveTab('prizes')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'prizes'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cash Prize & Escrow
          </button>
        </div>

        {/* Classes View */}
        {activeTab === 'classes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-bold text-slate-900 text-lg">Active Batches ({classes.length})</h3>
              <div className="grid grid-cols-1 gap-4">
                {classes.map((cls) => (
                  <Card key={cls.id} className="flex items-center justify-between p-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-900 text-base">{cls.title}</h4>
                        <Badge variant="info">Class ID: {cls.classCode}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {cls.studentCount} Students Enrolled
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          Daily Tasks Active
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm">Manage Students</Button>
                      <Button variant="primary" size="sm">Create Task</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Create Class Card */}
            <div>
              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <Plus className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900">Create New Class</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Generates a unique Class Code to share with your students.
                </p>

                <form onSubmit={handleSubmit(onCreateClass)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Class Title</label>
                    <input
                      {...register('title')}
                      type="text"
                      placeholder="e.g. Evening Public Speaking"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {errors.title && (
                      <p className="text-xs text-rose-500 mt-1 font-medium">{errors.title.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                    <textarea
                      {...register('description')}
                      rows={3}
                      placeholder="Program curriculum overview..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
                    Create Class & Code
                  </Button>
                </form>
              </Card>
            </div>
          </div>
        )}

        {/* Prizes View */}
        {activeTab === 'prizes' && (
          <Card className="space-y-6">
            <div className="flex items-center gap-3">
              <Award className="w-6 h-6 text-amber-500" />
              <div>
                <h3 className="font-bold text-slate-900 text-lg">Class Reward Pool & Cash Prize Awards</h3>
                <p className="text-xs text-slate-500">Reward top performers directly into their student platform wallet.</p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Available Trainer Reward Pool</p>
                <h4 className="text-2xl font-black text-amber-950 mt-1">₹5,000.00 INR</h4>
              </div>
              <Button variant="accent">Award Cash Prize</Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
