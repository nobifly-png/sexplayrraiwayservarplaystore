# Zexgram Backend - Project Structure

## Directory Overview

```
zexgram-backend/
├── src/                          # Source code
│   ├── app.js                    # Express app configuration
│   ├── server.js                 # Server bootstrap & startup
│   │
│   ├── config/                   # Configuration files
│   │   ├── db.js                 # MongoDB connection
│   │   ├── env.js                # Environment variables
│   │   ├── jwt.js                # JWT token utilities
│   │   ├── logger.js             # Pino logger setup
│   │   ├── r2.js                 # Cloudflare R2 client
│   │   └── telegram.js           # Telegram bot config
│   │
│   ├── common/                   # Shared utilities
│   │   ├── constants/            # Application constants
│   │   │   └── index.js
│   │   ├── enums/                # Enumerations
│   │   │   └── index.js
│   │   ├── errors/               # Custom error classes
│   │   │   └── index.js
│   │   ├── utils/                # Utility functions
│   │   │   └── index.js
│   │   └── helpers/              # Helper functions
│   │       └── response.helper.js
│   │
│   ├── middlewares/              # Express middlewares
│   │   ├── auth.middleware.js    # JWT authentication
│   │   ├── role.middleware.js    # Role-based authorization
│   │   ├── error.middleware.js   # Error handling
│   │   ├── rateLimit.middleware.js
│   │   ├── validate.middleware.js
│   │   ├── requestId.middleware.js
│   │   └── security.middleware.js
│   │
│   ├── modules/                  # Feature modules
│   │   │
│   │   ├── auth/                 # Authentication
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.validation.js
│   │   │   └── refreshSession.model.js
│   │   │
│   │   ├── users/                # User management
│   │   │   └── user.model.js
│   │   │
│   │   ├── videos/               # Video management
│   │   │   ├── video.controller.js
│   │   │   ├── video.service.js
│   │   │   ├── video.routes.js
│   │   │   ├── video.validation.js
│   │   │   └── video.model.js
│   │   │
│   │   ├── uploads/              # R2 upload handling
│   │   │   ├── upload.controller.js
│   │   │   ├── upload.service.js
│   │   │   ├── upload.routes.js
│   │   │   ├── upload.validation.js
│   │   │   └── uploadIntent.model.js
│   │   │
│   │   ├── links/                # Short link generation
│   │   │   ├── link.controller.js
│   │   │   ├── link.service.js
│   │   │   ├── link.routes.js
│   │   │   ├── link.validation.js
│   │   │   └── link.model.js
│   │   │
│   │   ├── playback/             # Playback tracking
│   │   │   ├── playback.controller.js
│   │   │   ├── playback.service.js
│   │   │   ├── playback.routes.js
│   │   │   ├── playback.validation.js
│   │   │   ├── playbackSession.model.js
│   │   │   ├── playbackEvent.model.js
│   │   │   └── viewLedger.model.js
│   │   │
│   │   ├── analytics/            # Analytics & reporting
│   │   │   ├── analytics.controller.js
│   │   │   ├── analytics.service.js
│   │   │   └── analytics.routes.js
│   │   │
│   │   ├── wallet/               # Wallet & earnings
│   │   │   ├── wallet.controller.js
│   │   │   ├── wallet.service.js
│   │   │   ├── wallet.routes.js
│   │   │   ├── wallet.model.js
│   │   │   └── walletTransaction.model.js
│   │   │
│   │   ├── withdrawals/          # Withdrawal management
│   │   │   ├── withdrawal.controller.js
│   │   │   ├── withdrawal.service.js
│   │   │   ├── withdrawal.routes.js
│   │   │   ├── withdrawal.validation.js
│   │   │   └── withdrawalRequest.model.js
│   │   │
│   │   ├── fraud/                # Fraud detection
│   │   │   ├── fraud.controller.js
│   │   │   ├── fraud.service.js
│   │   │   ├── fraud.routes.js
│   │   │   └── fraudFlag.model.js
│   │   │
│   │   ├── admin/                # Admin operations
│   │   │   ├── admin.controller.js
│   │   │   ├── admin.service.js
│   │   │   └── admin.routes.js
│   │   │
│   │   ├── settings/             # System settings
│   │   │   ├── settings.controller.js
│   │   │   ├── settings.service.js
│   │   │   ├── settings.routes.js
│   │   │   └── systemSetting.model.js
│   │   │
│   │   └── telegram/             # Telegram bot (placeholder)
│   │       └── telegram.bot.js
│   │
│   ├── routes/                   # Route aggregation
│   │   └── index.js
│   │
│   └── jobs/                     # Background jobs (placeholders)
│       ├── reconciliation.jobs.js
│       ├── fraud.jobs.js
│       └── cleanup.jobs.js
│
├── scripts/                      # Utility scripts
│   ├── seedSuperAdmin.js
│   └── seedSettings.js
│
├── .env.example                  # Environment template
├── .gitignore
├── package.json
├── README.md
├── API_DOCS.md
└── DEPLOYMENT.md
```

## Module Structure Pattern

Each feature module follows this pattern:

```
module-name/
├── moduleName.model.js       # Mongoose schema & model
├── moduleName.service.js     # Business logic
├── moduleName.controller.js  # Request handlers
├── moduleName.routes.js      # Route definitions
└── moduleName.validation.js  # Joi validation schemas
```

## Data Flow

```
Request
  ↓
Middleware (auth, validation, rate limit)
  ↓
Routes
  ↓
Controller (request handling)
  ↓
Service (business logic)
  ↓
Model (database operations)
  ↓
Response
```

## Key Design Patterns

### 1. Service Layer Pattern
- Controllers handle HTTP concerns
- Services contain business logic
- Models handle data persistence

### 2. Repository Pattern
- Mongoose models act as repositories
- Services interact with models
- No direct model access from controllers

### 3. Middleware Chain
- Security → Request ID → Auth → Validation → Controller

### 4. Error Handling
- Custom error classes
- Centralized error middleware
- Consistent error responses

### 5. Validation
- Joi schemas for input validation
- Validation middleware
- Type-safe data flow

## Database Models

### Core Models
- **User** - User accounts
- **RefreshSession** - JWT sessions
- **Video** - Video metadata
- **UploadIntent** - Upload tracking
- **Link** - Short links

### Playback Models
- **PlaybackSession** - Session tracking
- **PlaybackEvent** - Event logging
- **ViewLedger** - Immutable view records

### Financial Models
- **Wallet** - User balances
- **WalletTransaction** - Transaction log
- **WithdrawalRequest** - Withdrawal requests

### System Models
- **FraudFlag** - Fraud detection
- **SystemSetting** - Configuration

## API Architecture

### Public Routes
- `/api/l/:shortCode` - Link resolution
- `/api/playback/*` - Playback tracking

### Protected Routes (Creator)
- `/api/videos/*` - Video management
- `/api/uploads/*` - Upload operations
- `/api/links/*` - Link management
- `/api/wallet/*` - Wallet access
- `/api/withdrawals/*` - Withdrawal requests
- `/api/analytics/*` - Creator analytics

### Protected Routes (Admin)
- `/api/admin/*` - User management
- `/api/fraud/*` - Fraud review
- `/api/settings/*` - System settings
- `/api/withdrawals/admin/*` - Withdrawal review
- `/api/analytics/admin/*` - Platform analytics

## Security Layers

1. **Network Level**
   - Rate limiting
   - CORS
   - Helmet headers

2. **Authentication Level**
   - JWT tokens
   - Refresh token rotation
   - Session management

3. **Authorization Level**
   - Role-based access control
   - Resource ownership validation

4. **Data Level**
   - Input validation
   - SQL injection prevention (NoSQL)
   - XSS prevention

## Scalability Considerations

### Horizontal Scaling
- Stateless design
- JWT tokens (no server-side sessions)
- MongoDB replica sets

### Vertical Scaling
- Efficient queries with indexes
- Aggregation pipelines
- Lean queries

### Caching Strategy
- Future: Redis for hot data
- Future: CDN for static assets

## Testing Strategy (Future)

```
tests/
├── unit/           # Unit tests for services
├── integration/    # API endpoint tests
└── e2e/           # End-to-end flows
```

## Monitoring Points

- Request/response logging
- Error tracking
- Performance metrics
- Database query performance
- Fraud detection alerts

## Future Enhancements

1. **Background Jobs**
   - View reconciliation
   - Fraud pattern analysis
   - Cleanup tasks

2. **Telegram Bot**
   - Command handlers
   - User authentication
   - Notification system

3. **Advanced Features**
   - Email notifications
   - Webhook support
   - Advanced analytics
   - Payment gateway integration

## Development Workflow

1. Create feature branch
2. Implement model → service → controller → routes
3. Add validation schemas
4. Test endpoints
5. Update documentation
6. Create pull request

## Code Style

- Use async/await (no callbacks)
- Use arrow functions
- Use const/let (no var)
- Use template literals
- Use destructuring
- Use meaningful variable names
- Add comments for complex logic

## Dependencies

### Production
- express - Web framework
- mongoose - MongoDB ODM
- jsonwebtoken - JWT auth
- bcrypt - Password hashing
- joi - Validation
- helmet - Security headers
- cors - CORS handling
- pino - Logging
- @aws-sdk - R2 client
- nanoid - Short code generation

### Development
- nodemon - Auto-reload

## Configuration Management

- Environment-based config
- Centralized in `config/`
- No hardcoded values
- Secrets in environment variables

## Error Handling Strategy

1. Operational errors → Custom error classes
2. Programming errors → Let crash
3. Async errors → Caught by middleware
4. Unhandled rejections → Logged and exit

## Logging Strategy

- Structured logging with Pino
- Log levels: debug, info, warn, error
- Request/response logging
- Error stack traces in development
- Production: JSON format for parsing
