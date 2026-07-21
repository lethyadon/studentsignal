import { X, GraduationCap, Calendar, FileText, Star, AlertTriangle, CheckCircle, Briefcase, TrendingDown, Plus, ClipboardList } from 'lucide-react';

interface SignpostingResource {
  name: string;
  icon: React.ElementType;
  desc: string;
}

interface SignpostingModalProps {
  resource: SignpostingResource | null;
  studentId?: string;
  onClose: () => void;
  onCreateIntervention?: (studentId: string, actionType: string) => void;
  onAddToPlan?: (resource: string) => void;
}

const RESOURCE_DETAILS: Record<string, {
  whoFor: string;
  whyMatters: string;
  staffAction: string;
  studentAction: string;
  profileNote: string;
}> = {
  'College open days': {
    whoFor: 'All students in Year 9–11, especially those undecided on post-16 destinations',
    whyMatters: 'Visiting colleges helps students visualise their future, build aspiration and make more informed choices. Particularly impactful for students with low confidence or unclear pathways.',
    staffAction: 'Identify relevant open day dates, share with student and parent/carer. Consider whether student needs accompanying support.',
    studentAction: 'Attend at least two college open days. Bring a notepad. Ask about the course, typical day and support available.',
    profileNote: 'Student has been referred to college open days to support post-16 decision making and aspiration building.',
  },
  'Apprenticeships': {
    whoFor: 'Students in Year 10–11 with practical skills, career focus, or lower academic confidence',
    whyMatters: 'Apprenticeships offer earn-while-you-learn routes and are increasingly valued by employers. They suit students who thrive in practical environments and may be at risk of disengagement from academic pathways.',
    staffAction: 'Share resources on Level 2, 3 and degree apprenticeships. Connect with local employer contacts if available.',
    studentAction: 'Research apprenticeship vacancies in your area. Consider a mock application or work experience as preparation.',
    profileNote: 'Student has been signposted to apprenticeship pathways as part of post-16 planning and career development.',
  },
  'T Levels': {
    whoFor: 'Students interested in a technical qualification with strong industry content',
    whyMatters: 'T Levels are equivalent to 3 A Levels and include a 45-day industry placement. They provide a clear route to skilled employment or higher education in technical fields.',
    staffAction: 'Identify which local colleges offer T Levels in areas aligned with student interests. Share with student and parent/carer.',
    studentAction: 'Research T Level subjects at local colleges. Attend open days and ask about the industry placement component.',
    profileNote: 'Student has been signposted to T Levels as a technical qualification pathway following careers conversation.',
  },
  'A Levels': {
    whoFor: 'Students with strong academic engagement who are considering university or professional routes',
    whyMatters: 'A Levels remain the primary academic post-16 pathway. Understanding the commitment required helps students make informed choices and prepare effectively.',
    staffAction: 'Discuss subject selection based on student strengths and career interests. Encourage early research into entry requirements.',
    studentAction: 'Research A Level subjects and grade requirements for your preferred university courses. Plan a realistic subject combination.',
    profileNote: 'Student has been supported with A Level planning as part of their post-16 academic pathway discussion.',
  },
  'Vocational courses': {
    whoFor: 'Students who learn best through practical, applied study and have clear vocational interests',
    whyMatters: 'Vocational qualifications (BTECs, diplomas, NVQs) provide career-focused study and are valued by employers and universities. They are a strong alternative to A Levels for many students.',
    staffAction: 'Identify vocational courses aligned with student interests. Share prospectuses from local colleges.',
    studentAction: 'Explore BTEC, diploma and vocational options in your area of interest. Attend relevant taster sessions or open days.',
    profileNote: 'Student has been signposted to vocational course options following discussion of learning preferences and career aspirations.',
  },
  'SEND careers support': {
    whoFor: 'Students with an EHCP, SEN support, or identified additional needs who require tailored careers guidance',
    whyMatters: 'Students with SEND are statistically more likely to be NEET without targeted intervention. Specialist careers guidance ensures transition planning is appropriate, aspirational and legally compliant.',
    staffAction: 'Ensure careers guidance is included in EHCP review. Connect student with specialist careers adviser. Check supported internship and specialist provision options.',
    studentAction: 'Work with your careers adviser to build a personalised plan. Explore supported pathways, specialist colleges and employer schemes.',
    profileNote: 'Student has been referred for SEND careers support to ensure appropriate post-16 transition planning is in place.',
  },
  'Mentoring': {
    whoFor: 'Students with engagement concerns, low aspiration, or vulnerability indicators who would benefit from a consistent adult relationship',
    whyMatters: 'Regular mentoring builds trust, resilience and self-belief. Evidence shows it improves attendance, behaviour and engagement — particularly for at-risk students.',
    staffAction: 'Identify an appropriate in-school mentor or refer to an external mentoring programme. Set clear expectations and review frequency.',
    studentAction: 'Attend mentoring sessions consistently. Be open about challenges and aspirations. Use sessions to set small achievable goals.',
    profileNote: 'Student has been connected with mentoring support to build confidence and improve engagement.',
  },
  'Work experience': {
    whoFor: 'All students in Year 10–11, prioritised for those with unclear career direction or destination risk',
    whyMatters: 'Work experience builds employability skills, career awareness and motivation. For disengaged students it can be transformative — seeing the real-world relevance of learning.',
    staffAction: 'Support student to identify, apply for and prepare for a work experience placement. Brief employer on any specific needs.',
    studentAction: 'Research potential placements in your area of interest. Prepare a short introduction. Reflect on what you learn during the placement.',
    profileNote: 'Student has been supported with work experience planning as part of their career development and post-16 readiness.',
  },
  'CV and application support': {
    whoFor: 'Students preparing to apply for apprenticeships, college courses, jobs or sixth form',
    whyMatters: 'Many students — especially those from disadvantaged backgrounds — lack experience writing CVs or applications. Early support significantly improves their chances.',
    staffAction: 'Schedule a 1:1 CV session. Help student articulate their skills, experience and achievements. Review applications before submission.',
    studentAction: 'Draft a CV with support from your tutor or careers adviser. Review your personal statement. Practice interview responses.',
    profileNote: 'Student has received CV and application support as part of their post-16 preparation.',
  },
  'Confidence building': {
    whoFor: 'Students with low self-esteem, anxiety around the future, or lack of belief in their own capabilities',
    whyMatters: 'Low confidence is one of the most significant barriers to positive destination outcomes. Targeted programmes help students develop a growth mindset and believe in their ability to succeed.',
    staffAction: 'Refer to appropriate confidence programme or wellbeing support. Ensure regular check-ins. Celebrate small wins explicitly.',
    studentAction: 'Engage with confidence-building sessions or workshops. Set small goals and track progress. Talk to a trusted adult about your worries.',
    profileNote: 'Student has been referred to confidence-building support as part of their wellbeing and careers development.',
  },
  'Attendance & future goals': {
    whoFor: 'Students with attendance concerns who have not yet connected poor attendance to its impact on their future',
    whyMatters: 'Many students do not understand the long-term consequences of poor attendance on applications, references and employability. Linking aspirations to daily choices is a powerful motivator.',
    staffAction: 'Have an explicit conversation connecting attendance to future goals. Show student the link between attendance and applications/references. Set a weekly attendance target with review.',
    studentAction: 'Commit to a realistic attendance improvement target. Talk to your tutor about any barriers. Think about your future goals — and how being in school helps you get there.',
    profileNote: 'Student has had attendance linked to future goals conversation as part of re-engagement support.',
  },
  'NEET prevention': {
    whoFor: 'Students identified as at risk of becoming Not in Education, Employment or Training post-16',
    whyMatters: 'NEET outcomes have significant long-term social and economic impact. Early identification and targeted intervention significantly improves outcomes. Schools have a statutory duty to track and support Year 11 destinations.',
    staffAction: 'Complete a NEET risk assessment. Ensure student is registered with local authority tracking. Refer to specialist NEET prevention support if available. Secure at least one agreed destination offer before leaving.',
    studentAction: 'Work with your school to explore all available options. Do not leave school without a confirmed place. Ask for help if you are unsure what to do next.',
    profileNote: 'Student has been identified as at risk of NEET and referred for targeted prevention support and destination planning.',
  },
};

const ICON_MAP: Record<string, React.ElementType> = {
  'College open days': Calendar,
  'Apprenticeships': GraduationCap,
  'T Levels': FileText,
  'A Levels': Star,
  'Vocational courses': Briefcase,
  'SEND careers support': GraduationCap,
  'Mentoring': CheckCircle,
  'Work experience': Briefcase,
  'CV and application support': FileText,
  'Confidence building': Star,
  'Attendance & future goals': AlertTriangle,
  'NEET prevention': TrendingDown,
};

export { ICON_MAP };

export default function SignpostingModal({ resource, studentId, onClose, onCreateIntervention, onAddToPlan }: SignpostingModalProps) {
  if (!resource) return null;

  const details = RESOURCE_DETAILS[resource.name];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-5 border-b border-slate-100 flex items-start justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center">
              <resource.icon className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{resource.name}</h2>
              <p className="text-xs text-slate-500">Careers signposting resource</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {details ? (
            <>
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-100">
                <div className="text-xs font-semibold text-teal-700 uppercase tracking-wider mb-1">Who is this for?</div>
                <p className="text-sm text-teal-800">{details.whoFor}</p>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Why it matters</div>
                <p className="text-sm text-slate-700 leading-relaxed">{details.whyMatters}</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Suggested staff action</div>
                  <p className="text-sm text-blue-800">{details.staffAction}</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">Suggested student action</div>
                  <p className="text-sm text-emerald-800">{details.studentAction}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Example profile note</div>
                <p className="text-sm text-slate-700 italic">&ldquo;{details.profileNote}&rdquo;</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">No details available for this resource.</p>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex flex-col sm:flex-row gap-3 rounded-b-2xl">
          {studentId && onAddToPlan && (
            <button
              onClick={() => { onAddToPlan(resource.name); onClose(); }}
              className="btn-secondary flex-1 py-2.5"
            >
              <Plus className="w-4 h-4" />
              Add to student plan
            </button>
          )}
          {studentId && onCreateIntervention && (
            <button
              onClick={() => { onCreateIntervention(studentId, `Careers: ${resource.name}`); onClose(); }}
              className="btn-primary flex-1 py-2.5"
            >
              <ClipboardList className="w-4 h-4" />
              Create careers intervention
            </button>
          )}
          {!studentId && (
            <button onClick={onClose} className="btn-secondary flex-1 py-2.5">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

