import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { Home, Plus, Star, Download, X, Upload, Filter, ArrowDown } from 'lucide-react';

// Initialize Firebase
const app = initializeApp(window.__firebase_config);
const db = getFirestore(app);
const auth = getAuth(app);

// Authenticate with the initial token
if (window.__initial_auth_token) {
  signInWithCustomToken(auth, window.__initial_auth_token);
}

const GEMINI_API_KEY = 'AIzaSyBHZgjQOjgs4QI4QqPzWJZqj_123456789'; // Replace with actual API key

const App = () => {
  const [currentView, setCurrentView] = useState('HOME');
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [roles, setRoles] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showCVModal, setShowCVModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('score');
  const [filterBy, setFilterBy] = useState('all');

  // Form states
  const [roleForm, setRoleForm] = useState({ title: '', description: '' });
  const [cvText, setCvText] = useState('');

  useEffect(() => {
    // Set up real-time listeners for roles and candidates
    const rolesQuery = query(
      collection(db, `artifacts/${window.__app_id}/public/data/roles`),
      orderBy('title')
    );
    
    const candidatesQuery = query(
      collection(db, `artifacts/${window.__app_id}/public/data/candidates`),
      orderBy('score', 'desc')
    );

    const unsubscribeRoles = onSnapshot(rolesQuery, (snapshot) => {
      const rolesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRoles(rolesData);
    });

    const unsubscribeCandidates = onSnapshot(candidatesQuery, (snapshot) => {
      const candidatesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCandidates(candidatesData);
    });

    return () => {
      unsubscribeRoles();
      unsubscribeCandidates();
    };
  }, []);

  const analyzeAndRankCandidate = async (roleId, roleDescription, cvText) => {
    setLoading(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Role Description: ${roleDescription}\n\nCandidate CV Text: ${cvText}\n\nAnalyze this CV and return the structured JSON data. Ensure all percentage scores are integers (1-100) and that the summary is one sentence.`
            }]
          }],
          systemInstruction: {
            parts: [{
              text: "You are an expert AI HR Recruiter and Analyst. Your job is to analyze the candidate's CV against the provided role description. You must strictly follow the required JSON output schema for scores and analysis."
            }]
          },
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "The candidate's full name." },
                summary: { type: "string", description: "A single, concise sentence summarizing the candidate's background." },
                score: { type: "integer", description: "Overall simple score out of 100 for ranking." },
                overallMatch: { type: "integer" },
                roleFit: { type: "integer" },
                experience: { type: "integer" },
                qualification: { type: "integer" },
                specialTraits: { 
                  type: "array", 
                  items: { type: "string" }, 
                  description: "2-3 short, key positive tags." 
                },
                fitReason: { type: "string", description: "Detailed text about why they fit the role." },
                improvementAreas: { type: "string", description: "Detailed text about areas for growth." },
                nextStepRecommendation: { type: "string", description: "Recommended next step, e.g., 'Invite for the interview' or 'Further screening required'." }
              },
              required: ["name", "summary", "score", "overallMatch", "roleFit", "experience", "qualification", "specialTraits", "fitReason", "improvementAreas", "nextStepRecommendation"]
            }
          }
        })
      });

      const data = await response.json();
      const analysisResult = JSON.parse(data.candidates[0].content.parts[0].text);

      // Save to Firestore
      await addDoc(collection(db, `artifacts/${window.__app_id}/public/data/candidates`), {
        roleId,
        cvText,
        ...analysisResult,
        createdAt: new Date()
      });

      setShowCVModal(false);
      setCvText('');
    } catch (error) {
      console.error('Error analyzing candidate:', error);
      alert('Error analyzing candidate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, `artifacts/${window.__app_id}/public/data/roles`), {
        ...roleForm,
        candidateCount: 0,
        createdAt: new Date()
      });
      setRoleForm({ title: '', description: '' });
      setShowRoleModal(false);
    } catch (error) {
      console.error('Error creating role:', error);
    }
  };

  const handleCVSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRoleId || !cvText.trim()) return;
    
    const role = roles.find(r => r.id === selectedRoleId);
    if (role) {
      await analyzeAndRankCandidate(selectedRoleId, role.description, cvText);
    }
  };

  const getFilteredCandidates = () => {
    let filtered = candidates;
    
    if (currentView === 'ROLE_DETAIL' && selectedRoleId) {
      filtered = candidates.filter(c => c.roleId === selectedRoleId);
    }
    
    if (filterBy !== 'all') {
      filtered = filtered.filter(c => c.roleId === filterBy);
    }
    
    return filtered.sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  };

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId);
  const selectedRole = roles.find(r => r.id === selectedRoleId);

  const StatCard = ({ title, value, icon, className = "" }) => (
    <div className={`bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">{title}</span>
        {icon}
      </div>
      <div className="text-3xl font-light text-gray-900">{value}</div>
    </div>
  );

  const CandidateCard = ({ candidate, onClick }) => {
    const role = roles.find(r => r.id === candidate.roleId);
    return (
      <div 
        className="bg-gray-50 rounded-lg p-6 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => onClick(candidate.id)}
      >
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-xl font-normal text-gray-900">{candidate.name}</h3>
          <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-1">
            <Star className="w-4 h-4" />
            <span className="text-sm font-medium">{candidate.score} points</span>
          </div>
        </div>
        
        <p className="text-gray-600 text-sm mb-4 leading-relaxed">
          {candidate.summary}
        </p>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {candidate.specialTraits?.map((trait, index) => (
            <span key={index} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
              {trait}
            </span>
          ))}
        </div>
        
        <div className="text-sm text-gray-500">
          → {role?.title || 'Unknown Role'}
        </div>
      </div>
    );
  };

  const renderHomeView = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Candidates" 
          value={candidates.length} 
          className="md:col-span-1"
        />
        <StatCard 
          title="Average score" 
          value={`${Math.round(candidates.reduce((acc, c) => acc + c.score, 0) / candidates.length || 0)} *`}
          className="md:col-span-1"
        />
        <div className="bg-gradient-to-br from-indigo-100 to-blue-200 rounded-xl p-6 flex items-center justify-center">
          <button 
            onClick={() => setShowCVModal(true)}
            className="text-gray-600 hover:text-gray-800 transition-colors"
          >
            Upload new candidates
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-6">
          <button className="text-gray-900 font-medium border-b-2 border-gray-900 pb-1">
            New
          </button>
          <button className="text-gray-600 hover:text-gray-900 transition-colors">
            All
          </button>
        </div>
        
        <div className="flex gap-4">
          <button className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowDown className="w-4 h-4" />
            Sort by score
          </button>
          <button className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
            <Filter className="w-4 h-4" />
            Filter by role
          </button>
        </div>
      </div>

      {/* Candidates List */}
      <div className="space-y-3">
        {getFilteredCandidates().map(candidate => (
          <CandidateCard 
            key={candidate.id} 
            candidate={candidate}
            onClick={(id) => {
              setSelectedCandidateId(id);
              setCurrentView('CANDIDATE_DETAIL');
            }}
          />
        ))}
      </div>
    </div>
  );

  const renderRoleDetailView = () => (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <span>Open roles</span>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{selectedRole?.title}</span>
      </nav>

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-normal text-gray-900 mb-2">{selectedRole?.title}</h1>
          <p className="text-sm text-gray-500">Updated 2 days ago</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
            Copy link
          </button>
          <button 
            onClick={() => setShowCVModal(true)}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Add CV
          </button>
        </div>
      </div>

      {/* Role Description */}
      <div className="bg-white rounded-lg p-6">
        <p className="text-gray-700 leading-relaxed">{selectedRole?.description}</p>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex gap-6">
          <button className="text-gray-900 font-medium border-b-2 border-gray-900 pb-1">
            New
          </button>
          <button className="text-gray-600 hover:text-gray-900 transition-colors">
            All
          </button>
        </div>
        
        <div className="flex gap-4">
          <button className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowDown className="w-4 h-4" />
            Sort by score
          </button>
          <button className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
            <Filter className="w-4 h-4" />
            Filter by role
          </button>
        </div>
      </div>

      {/* Candidates List */}
      <div className="space-y-3">
        {getFilteredCandidates().map(candidate => (
          <CandidateCard 
            key={candidate.id} 
            candidate={candidate}
            onClick={(id) => {
              setSelectedCandidateId(id);
              setCurrentView('CANDIDATE_DETAIL');
            }}
          />
        ))}
      </div>
    </div>
  );

  const renderCandidateDetailView = () => (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500">
        <span>Open roles</span>
        <span className="mx-2">›</span>
        <span>{selectedRole?.title}</span>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{selectedCandidate?.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-normal text-gray-900">{selectedCandidate?.name}</h1>
        <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2">
          <Star className="w-5 h-5" />
          <span className="font-medium">{selectedCandidate?.score} points</span>
        </div>
      </div>

      <p className="text-sm text-gray-500">Updated 2 days ago</p>

      {/* Summary */}
      <div className="bg-white rounded-lg p-6">
        <p className="text-gray-700 leading-relaxed">{selectedCandidate?.summary}</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-sm text-gray-600 mb-1">Overall match</div>
          <div className="text-2xl font-semibold text-gray-900">{selectedCandidate?.overallMatch}%</div>
        </div>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-sm text-gray-600 mb-1">Role fit</div>
          <div className="text-2xl font-semibold text-gray-900">{selectedCandidate?.roleFit}%</div>
        </div>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-sm text-gray-600 mb-1">Experience</div>
          <div className="text-2xl font-semibold text-gray-900">{selectedCandidate?.experience}%</div>
        </div>
        <div className="bg-white rounded-lg p-4 text-center">
          <div className="text-sm text-gray-600 mb-1">Qualification</div>
          <div className="text-2xl font-semibold text-gray-900">{selectedCandidate?.qualification}%</div>
        </div>
      </div>

      {/* Analysis Sections */}
      <div className="space-y-6">
        <div className="bg-white rounded-lg p-6">
          <h2 className="text-xl font-medium text-gray-900 mb-4">What makes {selectedCandidate?.name?.split(' ')[0]} special</h2>
          <p className="text-gray-700 mb-4 leading-relaxed">{selectedCandidate?.fitReason}</p>
          <div className="flex flex-wrap gap-2">
            {selectedCandidate?.specialTraits?.map((trait, index) => (
              <span key={index} className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                {trait}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg p-6">
          <h2 className="text-xl font-medium text-gray-900 mb-4">Areas for Improvement</h2>
          <p className="text-gray-700 leading-relaxed">{selectedCandidate?.improvementAreas}</p>
        </div>

        <div className="bg-blue-50 rounded-lg p-6">
          <div className="text-xs text-gray-600 uppercase tracking-wide mb-2">Recommended next step</div>
          <h3 className="text-xl font-medium text-gray-900 mb-3">{selectedCandidate?.nextStepRecommendation}</h3>
          <p className="text-gray-700 leading-relaxed">
            Focus interview questions on specific experience with regulatory compliance for defense manufacturing/import-export and the establishment of physical logistics or manufacturing bases.
          </p>
        </div>
      </div>

      {/* Download CV */}
      <div className="flex justify-center">
        <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
          <Download className="w-4 h-4" />
          Download full CV
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 p-6 flex flex-col">
        {/* User Profile */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-gray-300 rounded-lg"></div>
          <span className="font-medium text-gray-900">Alex | Ark</span>
        </div>

        {/* Navigation */}
        <nav className="space-y-2 mb-8">
          <button 
            onClick={() => setCurrentView('HOME')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              currentView === 'HOME' ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Home className="w-5 h-5" />
            Home
          </button>
          <button 
            onClick={() => setShowRoleModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-600 hover:text-gray-900 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add new role
          </button>
        </nav>

        {/* Roles List */}
        <div className="space-y-3">
          {roles.map(role => (
            <button
              key={role.id}
              onClick={() => {
                setSelectedRoleId(role.id);
                setCurrentView('ROLE_DETAIL');
              }}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedRoleId === role.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <div className="font-medium text-gray-900 mb-1">{role.title}</div>
              <div className="text-sm text-gray-500">
                {candidates.filter(c => c.roleId === role.id).length} candidate{candidates.filter(c => c.roleId === role.id).length !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        {currentView === 'HOME' && renderHomeView()}
        {currentView === 'ROLE_DETAIL' && renderRoleDetailView()}
        {currentView === 'CANDIDATE_DETAIL' && renderCandidateDetailView()}
      </div>

      {/* Role Creation Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-medium">Create New Role</h2>
              <button onClick={() => setShowRoleModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={roleForm.title}
                  onChange={(e) => setRoleForm({...roleForm, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., AI Engineer"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({...roleForm, description: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-32"
                  placeholder="Detailed job description..."
                  required
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CV Upload Modal */}
      {showCVModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-medium">Upload CV</h2>
              <button onClick={() => setShowCVModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
                <p className="text-gray-600">Analyzing candidate with AI...</p>
              </div>
            ) : (
              <form onSubmit={handleCVSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CV Text</label>
                  <textarea
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-40"
                    placeholder="Paste the candidate's CV text here..."
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCVModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedRoleId}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Analyze CV
                  </button>
                </div>
                {!selectedRoleId && (
                  <p className="text-sm text-red-600">Please select a role first</p>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;