export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      billing_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          event_type: string
          id: string
          interval: string | null
          mrr_cents: number | null
          occurred_at: string
          plan: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_event_id: string | null
          stripe_subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          event_type: string
          id?: string
          interval?: string | null
          mrr_cents?: number | null
          occurred_at: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          event_type?: string
          id?: string
          interval?: string | null
          mrr_cents?: number | null
          occurred_at?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_topics: {
        Row: {
          common_mistakes: Json
          created_at: string
          description: string
          id: string
          learning_objectives: Json
          tips_and_tricks: Json
          title: string
          user_id: string
        }
        Insert: {
          common_mistakes: Json
          created_at?: string
          description: string
          id?: string
          learning_objectives: Json
          tips_and_tricks: Json
          title: string
          user_id: string
        }
        Update: {
          common_mistakes?: Json
          created_at?: string
          description?: string
          id?: string
          learning_objectives?: Json
          tips_and_tricks?: Json
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_topics_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_quest_problems: {
        Row: {
          answered_at: string | null
          bucket: string
          difficulty_level: number
          id: string
          is_correct: boolean | null
          order_index: number
          problem_id: string
          quest_id: string
          response_time_ms: number | null
          selected_option: number | null
          subtopic_id: string
        }
        Insert: {
          answered_at?: string | null
          bucket: string
          difficulty_level: number
          id?: string
          is_correct?: boolean | null
          order_index: number
          problem_id: string
          quest_id: string
          response_time_ms?: number | null
          selected_option?: number | null
          subtopic_id: string
        }
        Update: {
          answered_at?: string | null
          bucket?: string
          difficulty_level?: number
          id?: string
          is_correct?: boolean | null
          order_index?: number
          problem_id?: string
          quest_id?: string
          response_time_ms?: number | null
          selected_option?: number | null
          subtopic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_quest_problems_problem_id_problems_fk"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_quest_problems_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "daily_quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_quest_problems_subtopic_id_fkey"
            columns: ["subtopic_id"]
            isOneToOne: false
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_quests: {
        Row: {
          correct_count: number
          created_at: string
          id: string
          quest_date: string
          score: number
          status: string
          time_elapsed_seconds: number
          total_questions: number
          updated_at: string
          user_id: string
          xp_earned: number
        }
        Insert: {
          correct_count?: number
          created_at?: string
          id?: string
          quest_date: string
          score?: number
          status?: string
          time_elapsed_seconds?: number
          total_questions?: number
          updated_at?: string
          user_id: string
          xp_earned?: number
        }
        Update: {
          correct_count?: number
          created_at?: string
          id?: string
          quest_date?: string
          score?: number
          status?: string
          time_elapsed_seconds?: number
          total_questions?: number
          updated_at?: string
          user_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      educator_assignments: {
        Row: {
          answer_key: string | null
          assigned_date: string
          class_id: string | null
          created_at: string
          due_date: string
          id: string
          instructions: string
          prompt: string | null
          questions: Json | null
          source: string
          teacher_id: string
          title: string
        }
        Insert: {
          answer_key?: string | null
          assigned_date?: string
          class_id?: string | null
          created_at?: string
          due_date: string
          id?: string
          instructions: string
          prompt?: string | null
          questions?: Json | null
          source?: string
          teacher_id: string
          title: string
        }
        Update: {
          answer_key?: string | null
          assigned_date?: string
          class_id?: string | null
          created_at?: string
          due_date?: string
          id?: string
          instructions?: string
          prompt?: string | null
          questions?: Json | null
          source?: string
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "educator_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "educator_assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "educator_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      educator_classes: {
        Row: {
          created_at: string
          id: string
          name: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "educator_classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      educator_parent_reports: {
        Row: {
          id: string
          period_end: string
          period_start: string
          sent_at: string
          student_id: string
          summary: string | null
          teacher_id: string
        }
        Insert: {
          id?: string
          period_end: string
          period_start: string
          sent_at?: string
          student_id: string
          summary?: string | null
          teacher_id: string
        }
        Update: {
          id?: string
          period_end?: string
          period_start?: string
          sent_at?: string
          student_id?: string
          summary?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "educator_parent_reports_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "educator_parent_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "educator_students"
            referencedColumns: ["id"]
          },
        ]
      }
      educator_students: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          name: string
          parent_email: string
          student_email: string
          teacher_id: string
          user_id: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          name: string
          parent_email: string
          student_email: string
          teacher_id: string
          user_id?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_email?: string
          student_email?: string
          teacher_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "educator_students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      educator_submissions: {
        Row: {
          answers: Json | null
          assignment_id: string
          created_at: string
          feedback: string | null
          grade: number | null
          graded_at: string | null
          id: string
          images: Json | null
          response: string | null
          simulated: boolean
          student_id: string
          submitted_at: string | null
          teacher_feedback: string | null
          user_id: string | null
        }
        Insert: {
          answers?: Json | null
          assignment_id: string
          created_at?: string
          feedback?: string | null
          grade?: number | null
          graded_at?: string | null
          id?: string
          images?: Json | null
          response?: string | null
          simulated?: boolean
          student_id: string
          submitted_at?: string | null
          teacher_feedback?: string | null
          user_id?: string | null
        }
        Update: {
          answers?: Json | null
          assignment_id?: string
          created_at?: string
          feedback?: string | null
          grade?: number | null
          graded_at?: string | null
          id?: string
          images?: Json | null
          response?: string | null
          simulated?: boolean
          student_id?: string
          submitted_at?: string | null
          teacher_feedback?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "educator_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "educator_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "educator_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "educator_students"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          friend_user_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_user_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_user_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_user_id_users_id_fk"
            columns: ["friend_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      full_sat_answers: {
        Row: {
          answered_at: string | null
          attempt_id: string
          id: string
          is_correct: boolean | null
          module: number
          order_index: number
          problem_id: string
          response_time_ms: number | null
          section: string
          selected_option: number | null
        }
        Insert: {
          answered_at?: string | null
          attempt_id: string
          id?: string
          is_correct?: boolean | null
          module: number
          order_index: number
          problem_id: string
          response_time_ms?: number | null
          section: string
          selected_option?: number | null
        }
        Update: {
          answered_at?: string | null
          attempt_id?: string
          id?: string
          is_correct?: boolean | null
          module?: number
          order_index?: number
          problem_id?: string
          response_time_ms?: number | null
          section?: string
          selected_option?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "full_sat_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "full_sat_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "full_sat_answers_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
        ]
      }
      full_sat_attempts: {
        Row: {
          completed_at: string | null
          created_at: string
          current_module: number | null
          current_question: number | null
          current_section: string | null
          id: string
          math_module1_correct: number | null
          math_raw_score: number | null
          math_scaled_score: number | null
          math_time_seconds: number | null
          rw_module1_correct: number | null
          rw_raw_score: number | null
          rw_scaled_score: number | null
          rw_time_seconds: number | null
          started_at: string
          status: string
          test_id: string
          total_score: number | null
          total_time_seconds: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_module?: number | null
          current_question?: number | null
          current_section?: string | null
          id?: string
          math_module1_correct?: number | null
          math_raw_score?: number | null
          math_scaled_score?: number | null
          math_time_seconds?: number | null
          rw_module1_correct?: number | null
          rw_raw_score?: number | null
          rw_scaled_score?: number | null
          rw_time_seconds?: number | null
          started_at?: string
          status?: string
          test_id: string
          total_score?: number | null
          total_time_seconds?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_module?: number | null
          current_question?: number | null
          current_section?: string | null
          id?: string
          math_module1_correct?: number | null
          math_raw_score?: number | null
          math_scaled_score?: number | null
          math_time_seconds?: number | null
          rw_module1_correct?: number | null
          rw_raw_score?: number | null
          rw_scaled_score?: number | null
          rw_time_seconds?: number | null
          started_at?: string
          status?: string
          test_id?: string
          total_score?: number | null
          total_time_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "full_sat_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "full_sat_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "full_sat_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      full_sat_test_problems: {
        Row: {
          id: string
          module: number
          order_index: number
          problem_id: string
          section: string
          test_id: string
        }
        Insert: {
          id?: string
          module: number
          order_index: number
          problem_id: string
          section: string
          test_id: string
        }
        Update: {
          id?: string
          module?: number
          order_index?: number
          problem_id?: string
          section?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "full_sat_test_problems_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "full_sat_test_problems_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "full_sat_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      full_sat_tests: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          test_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          test_number: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          test_number?: number
        }
        Relationships: []
      }
      learning_queue: {
        Row: {
          added_during: string
          created_at: string
          id: string
          lesson_id: string
          progress_pct: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          added_during?: string
          created_at?: string
          id?: string
          lesson_id: string
          progress_pct?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          added_during?: string
          created_at?: string
          id?: string
          lesson_id?: string
          progress_pct?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_queue_lesson_id_lessons_id_fk"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_queue_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: Json
          created_at: string
          estimated_duration_minutes: number
          id: string
          problem_id: string
          title: string
        }
        Insert: {
          content: Json
          created_at?: string
          estimated_duration_minutes?: number
          id?: string
          problem_id: string
          title: string
        }
        Update: {
          content?: Json
          created_at?: string
          estimated_duration_minutes?: number
          id?: string
          problem_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_problem_id_problems_fk"
            columns: ["problem_id"]
            isOneToOne: true
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
        ]
      }
      micro_lesson_sessions: {
        Row: {
          chat_messages: number | null
          checkins_correct: number | null
          checkins_total: number | null
          completed: boolean | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          last_heartbeat_at: string
          micro_lesson_id: string
          started_at: string
          steps_viewed: number | null
          subtopic_id: string
          total_steps: number | null
          user_id: string
        }
        Insert: {
          chat_messages?: number | null
          checkins_correct?: number | null
          checkins_total?: number | null
          completed?: boolean | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          last_heartbeat_at?: string
          micro_lesson_id: string
          started_at?: string
          steps_viewed?: number | null
          subtopic_id: string
          total_steps?: number | null
          user_id: string
        }
        Update: {
          chat_messages?: number | null
          checkins_correct?: number | null
          checkins_total?: number | null
          completed?: boolean | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          last_heartbeat_at?: string
          micro_lesson_id?: string
          started_at?: string
          steps_viewed?: number | null
          subtopic_id?: string
          total_steps?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "micro_lesson_sessions_micro_lesson_id_fkey"
            columns: ["micro_lesson_id"]
            isOneToOne: false
            referencedRelation: "micro_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_lesson_sessions_subtopic_id_fkey"
            columns: ["subtopic_id"]
            isOneToOne: false
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "micro_lesson_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      micro_lessons: {
        Row: {
          created_at: string
          id: string
          lesson_content: string
          status: string
          subtopic_id: string
          updated_at: string
          whiteboard_steps: Json
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_content?: string
          status?: string
          subtopic_id: string
          updated_at?: string
          whiteboard_steps?: Json
        }
        Update: {
          created_at?: string
          id?: string
          lesson_content?: string
          status?: string
          subtopic_id?: string
          updated_at?: string
          whiteboard_steps?: Json
        }
        Relationships: [
          {
            foreignKeyName: "micro_lessons_subtopic_id_subtopics_id_fk"
            columns: ["subtopic_id"]
            isOneToOne: true
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_scripts: {
        Row: {
          created_at: string
          estimated_duration_minutes: number | null
          has_guest: boolean
          id: string
          lines: Json
          speakers: Json
          status: string
          subtopic_id: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_duration_minutes?: number | null
          has_guest?: boolean
          id?: string
          lines?: Json
          speakers?: Json
          status?: string
          subtopic_id: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_duration_minutes?: number | null
          has_guest?: boolean
          id?: string
          lines?: Json
          speakers?: Json
          status?: string
          subtopic_id?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_scripts_subtopic_id_subtopics_id_fk"
            columns: ["subtopic_id"]
            isOneToOne: true
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      infographics: {
        Row: {
          brief: Json
          created_at: string
          id: string
          image_url: string | null
          status: string
          subtopic_id: string
          updated_at: string
        }
        Insert: {
          brief?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          status?: string
          subtopic_id: string
          updated_at?: string
        }
        Update: {
          brief?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          status?: string
          subtopic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "infographics_subtopic_id_subtopics_id_fk"
            columns: ["subtopic_id"]
            isOneToOne: true
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          created_at: string
          current_step: string
          id: string
          lesson_preference: string | null
          quiz_question_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: string
          id?: string
          lesson_preference?: string | null
          quiz_question_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: string
          id?: string
          lesson_preference?: string | null
          quiz_question_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      problems: {
        Row: {
          category: string | null
          common_errors: Json
          concept_tags: Json
          correct_option: number
          created_at: string
          custom_topic_id: string | null
          detailed_hint: string | null
          difficulty: string
          difficulty_level: number
          explanation: string
          hint: string
          id: string
          options: Json
          order_index: number
          question_phonetic: string | null
          question_text: string
          sat_frequency: string | null
          solution_steps: Json
          source: Database["public"]["Enums"]["problem_source"]
          subtopic_id: string | null
          subtopic_slug: string | null
          time_recommendation_seconds: number
          topic_slug: string | null
        }
        Insert: {
          category?: string | null
          common_errors?: Json
          concept_tags?: Json
          correct_option: number
          created_at?: string
          custom_topic_id?: string | null
          detailed_hint?: string | null
          difficulty: string
          difficulty_level?: number
          explanation: string
          hint?: string
          id?: string
          options: Json
          order_index: number
          question_phonetic?: string | null
          question_text: string
          sat_frequency?: string | null
          solution_steps?: Json
          source: Database["public"]["Enums"]["problem_source"]
          subtopic_id?: string | null
          subtopic_slug?: string | null
          time_recommendation_seconds?: number
          topic_slug?: string | null
        }
        Update: {
          category?: string | null
          common_errors?: Json
          concept_tags?: Json
          correct_option?: number
          created_at?: string
          custom_topic_id?: string | null
          detailed_hint?: string | null
          difficulty?: string
          difficulty_level?: number
          explanation?: string
          hint?: string
          id?: string
          options?: Json
          order_index?: number
          question_phonetic?: string | null
          question_text?: string
          sat_frequency?: string | null
          solution_steps?: Json
          source?: Database["public"]["Enums"]["problem_source"]
          subtopic_id?: string | null
          subtopic_slug?: string | null
          time_recommendation_seconds?: number
          topic_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "problems_custom_topic_id_fkey"
            columns: ["custom_topic_id"]
            isOneToOne: false
            referencedRelation: "custom_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_subtopic_id_fkey"
            columns: ["subtopic_id"]
            isOneToOne: false
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          created_at: string
          difficulty_level: number | null
          hint_used: boolean | null
          id: string
          is_correct: boolean
          practice_completed: boolean | null
          problem_id: string
          response_time_ms: number | null
          selected_option: number
          session_id: string
          tutor_used: boolean | null
          wrong_count: number | null
        }
        Insert: {
          created_at?: string
          difficulty_level?: number | null
          hint_used?: boolean | null
          id?: string
          is_correct: boolean
          practice_completed?: boolean | null
          problem_id: string
          response_time_ms?: number | null
          selected_option: number
          session_id: string
          tutor_used?: boolean | null
          wrong_count?: number | null
        }
        Update: {
          created_at?: string
          difficulty_level?: number | null
          hint_used?: boolean | null
          id?: string
          is_correct?: boolean
          practice_completed?: boolean | null
          problem_id?: string
          response_time_ms?: number | null
          selected_option?: number
          session_id?: string
          tutor_used?: boolean | null
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_question_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          practice_problem_id: string | null
          problem_id: string
          response_time_ms: number | null
          selected_option: number | null
          session_id: string
          user_id: string
          wrong_count: number | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          practice_problem_id?: string | null
          problem_id: string
          response_time_ms?: number | null
          selected_option?: number | null
          session_id: string
          user_id: string
          wrong_count?: number | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          practice_problem_id?: string | null
          problem_id?: string
          response_time_ms?: number | null
          selected_option?: number | null
          session_id?: string
          user_id?: string
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_question_events_practice_problem_id_fkey"
            columns: ["practice_problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_question_events_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_question_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_question_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          created_at: string
          custom_topic_id: string | null
          id: string
          score: number
          source: Database["public"]["Enums"]["session_source"]
          subtopic_id: string | null
          time_elapsed_seconds: number
          total_questions: number
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_topic_id?: string | null
          id?: string
          score?: number
          source: Database["public"]["Enums"]["session_source"]
          subtopic_id?: string | null
          time_elapsed_seconds?: number
          total_questions?: number
          user_id: string
        }
        Update: {
          created_at?: string
          custom_topic_id?: string | null
          id?: string
          score?: number
          source?: Database["public"]["Enums"]["session_source"]
          subtopic_id?: string | null
          time_elapsed_seconds?: number
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_custom_topic_id_fkey"
            columns: ["custom_topic_id"]
            isOneToOne: false
            referencedRelation: "custom_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_subtopic_id_fkey"
            columns: ["subtopic_id"]
            isOneToOne: false
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          day_of_week: string
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: string
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: string
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          id: string
          reminder_sent_at: string | null
          schedule_id: string
          scheduled_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reminder_sent_at?: string | null
          schedule_id: string
          scheduled_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reminder_sent_at?: string | null
          schedule_id?: string
          scheduled_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_schedule_id_schedules_id_fk"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subsection_skills: {
        Row: {
          correct_attempts: number
          created_at: string
          id: string
          last_10: boolean[]
          last_seen_at: string | null
          level: number
          section_category: string
          streak_correct: number
          streak_wrong: number
          subtopic_id: string
          total_attempts: number
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          correct_attempts?: number
          created_at?: string
          id?: string
          last_10?: boolean[]
          last_seen_at?: string | null
          level?: number
          section_category: string
          streak_correct?: number
          streak_wrong?: number
          subtopic_id: string
          total_attempts?: number
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          correct_attempts?: number
          created_at?: string
          id?: string
          last_10?: boolean[]
          last_seen_at?: string | null
          level?: number
          section_category?: string
          streak_correct?: number
          streak_wrong?: number
          subtopic_id?: string
          total_attempts?: number
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "subsection_skills_subtopic_id_fkey"
            columns: ["subtopic_id"]
            isOneToOne: false
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsection_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subtopic_lore: {
        Row: {
          created_at: string
          id: string
          status: string
          subtopic_id: string
          updated_at: string
          whiteboard_steps: Json
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          subtopic_id: string
          updated_at?: string
          whiteboard_steps?: Json
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          subtopic_id?: string
          updated_at?: string
          whiteboard_steps?: Json
        }
        Relationships: [
          {
            foreignKeyName: "subtopic_lore_subtopic_id_subtopics_id_fk"
            columns: ["subtopic_id"]
            isOneToOne: true
            referencedRelation: "subtopics"
            referencedColumns: ["id"]
          },
        ]
      }
      subtopics: {
        Row: {
          common_mistakes: Json
          conceptual_overview: Json
          created_at: string
          description: string
          difficulty: string
          estimated_minutes: number
          id: string
          key_formulas: Json
          learning_objectives: Json
          name: string
          order_index: number
          prerequisite_subtopic_slugs: Json
          slug: string
          tips_and_tricks: Json
          topic_id: string
        }
        Insert: {
          common_mistakes: Json
          conceptual_overview: Json
          created_at?: string
          description: string
          difficulty: string
          estimated_minutes: number
          id?: string
          key_formulas: Json
          learning_objectives: Json
          name: string
          order_index: number
          prerequisite_subtopic_slugs: Json
          slug: string
          tips_and_tricks: Json
          topic_id: string
        }
        Update: {
          common_mistakes?: Json
          conceptual_overview?: Json
          created_at?: string
          description?: string
          difficulty?: string
          estimated_minutes?: number
          id?: string
          key_formulas?: Json
          learning_objectives?: Json
          name?: string
          order_index?: number
          prerequisite_subtopic_slugs?: Json
          slug?: string
          tips_and_tricks?: Json
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtopics_topic_id_topics_id_fk"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          color_scheme: string
          created_at: string
          difficulty_distribution: Json
          estimated_total_minutes: number
          icon: string
          id: string
          key_concepts: Json
          learning_objectives: Json
          name: string
          order_index: number
          overview: string
          prerequisites: Json
          pro_tips: Json
          sat_relevance: Json
          slug: string
          subject: string
        }
        Insert: {
          color_scheme: string
          created_at?: string
          difficulty_distribution: Json
          estimated_total_minutes: number
          icon: string
          id?: string
          key_concepts: Json
          learning_objectives: Json
          name: string
          order_index: number
          overview: string
          prerequisites: Json
          pro_tips: Json
          sat_relevance: Json
          slug: string
          subject?: string
        }
        Update: {
          color_scheme?: string
          created_at?: string
          difficulty_distribution?: Json
          estimated_total_minutes?: number
          icon?: string
          id?: string
          key_concepts?: Json
          learning_objectives?: Json
          name?: string
          order_index?: number
          overview?: string
          prerequisites?: Json
          pro_tips?: Json
          sat_relevance?: Json
          slug?: string
          subject?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          grade: string | null
          id: string
          interests: string[] | null
          learner_types: string[] | null
          lesson_delivery: string | null
          name: string | null
          struggling_topic: string | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grade?: string | null
          id?: string
          interests?: string[] | null
          learner_types?: string[] | null
          lesson_delivery?: string | null
          name?: string | null
          struggling_topic?: string | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grade?: string | null
          id?: string
          interests?: string[] | null
          learner_types?: string[] | null
          lesson_delivery?: string | null
          name?: string | null
          struggling_topic?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_users_id_fk"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          avatar_url: string | null
          best_streak: number
          clerk_id: string | null
          created_at: string
          current_composite: number | null
          current_math: number | null
          current_reading_writing: number | null
          display_name: string | null
          email: string
          id: string
          learning_access: boolean | null
          onboarding_completed: boolean
          skill_score: number | null
          start_composite: number | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_amount_cents: number | null
          subscription_canceled_at: string | null
          subscription_current_period_end: string | null
          subscription_interval: string | null
          subscription_plan: string | null
          subscription_started_at: string | null
          subscription_status: string | null
          target_score: number | null
          timezone: string
          total_xp: number
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          auth_id?: string | null
          avatar_url?: string | null
          best_streak?: number
          clerk_id?: string | null
          created_at?: string
          current_composite?: number | null
          current_math?: number | null
          current_reading_writing?: number | null
          display_name?: string | null
          email: string
          id?: string
          learning_access?: boolean | null
          onboarding_completed?: boolean
          skill_score?: number | null
          start_composite?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_amount_cents?: number | null
          subscription_canceled_at?: string | null
          subscription_current_period_end?: string | null
          subscription_interval?: string | null
          subscription_plan?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          target_score?: number | null
          timezone?: string
          total_xp?: number
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          auth_id?: string | null
          avatar_url?: string | null
          best_streak?: number
          clerk_id?: string | null
          created_at?: string
          current_composite?: number | null
          current_math?: number | null
          current_reading_writing?: number | null
          display_name?: string | null
          email?: string
          id?: string
          learning_access?: boolean | null
          onboarding_completed?: boolean
          skill_score?: number | null
          start_composite?: number | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_amount_cents?: number | null
          subscription_canceled_at?: string | null
          subscription_current_period_end?: string | null
          subscription_interval?: string | null
          subscription_plan?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          target_score?: number | null
          timezone?: string
          total_xp?: number
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reset_onboarding: { Args: { user_email: string }; Returns: undefined }
    }
    Enums: {
      problem_source: "onboarding" | "sat" | "practice" | "custom" | "full_sat"
      session_source: "onboarding" | "sat" | "custom" | "full_sat"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      problem_source: ["onboarding", "sat", "practice", "custom", "full_sat"],
      session_source: ["onboarding", "sat", "custom", "full_sat"],
    },
  },
} as const
