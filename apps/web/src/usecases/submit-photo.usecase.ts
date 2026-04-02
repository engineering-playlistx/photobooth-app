import { SessionRepository } from '../repositories/session.repository'
import { UserRepository } from '../repositories/user.repository'
import { EmailService } from '../services/email.service'
import { getSupabaseAdminClient } from '../utils/supabase-admin'

const SUPABASE_BUCKET = 'photobooth-bucket'

export interface SubmitPhotoRequest {
  photoPath: string
  name: string
  email: string
  phone: string
  selectedTheme?: string
  eventId?: string
  sessionId?: string
  moduleOutputs?: Record<string, unknown>
}

export interface SubmitPhotoResult {
  photoUrl: string
  userId: string
  sessionId: string
}

export class SubmitPhotoUseCase {
  private userRepository: UserRepository
  private sessionRepository: SessionRepository
  private emailService: EmailService

  constructor() {
    this.userRepository = new UserRepository()
    this.sessionRepository = new SessionRepository()
    this.emailService = new EmailService()
  }

  async execute(request: SubmitPhotoRequest): Promise<SubmitPhotoResult> {
    const supabase = getSupabaseAdminClient()

    const user = await this.userRepository.createUser({
      name: request.name,
      email: request.email,
      phone: request.phone,
      photoPath: request.photoPath,
      selectedTheme: request.selectedTheme,
      eventId: request.eventId,
    })

    const {
      data: { publicUrl: photoUrl },
    } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(request.photoPath)

    const sessionId = request.sessionId ?? crypto.randomUUID()
    if (request.sessionId) {
      await this.sessionRepository.completeSession(request.sessionId, {
        photoPath: request.photoPath,
        userInfo: {
          name: request.name,
          email: request.email,
          phone: request.phone,
        },
        moduleOutputs: request.moduleOutputs ?? {},
      })
    } else {
      await this.sessionRepository.createSession({
        id: sessionId,
        eventId: request.eventId ?? 'evt_shell_001',
        photoPath: request.photoPath,
        userInfo: {
          name: request.name,
          email: request.email,
          phone: request.phone,
        },
      })
    }

    try {
      await this.emailService.sendPhotoEmail({
        recipientEmail: request.email,
        recipientName: request.name,
        photoUrl,
      })
    } catch (emailError) {
      console.error('Failed to send email:', emailError)
    }

    return {
      photoUrl,
      userId: user.id,
      sessionId,
    }
  }
}
