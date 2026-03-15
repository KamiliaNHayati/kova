;; service-registry.clar
;; Kova Service Registry - Per-User Indexer Pattern
;; Each provider can register services indexed per-user.
;; Services are keyed by (owner, index) for efficient lookup.

;; =====================
;; Error codes
;; =====================
(define-constant ERR-NOT-OWNER (err u200))
(define-constant ERR-SERVICE-EXISTS (err u201))
(define-constant ERR-SERVICE-NOT-FOUND (err u202))
(define-constant ERR-ZERO-PRICE (err u203))
(define-constant ERR-EMPTY-NAME (err u204))
(define-constant ERR-EMPTY-URL (err u205))
(define-constant ERR-INVALID-PRINCIPAL (err u206))

;; =====================
;; Constants & Config
;; =====================
(define-constant ERR-MAX-SERVICES (err u207))
(define-constant MAX-SERVICES-PER-USER u5)


;; =====================
;; Data storage
;; =====================

;; How many services each user has registered (acts as next-index)
(define-map service-count principal uint)

;; Per-user services, keyed by (owner, index)
;; Clarity equivalent of Solidity: mapping(address => mapping(uint => Service))
(define-map user-services
  { owner: principal, index: uint }
  {
    name: (string-ascii 64),
    description: (string-ascii 256),
    url: (string-ascii 256),
    price-per-call: uint,
    active: bool
  }
)

;; =====================
;; Read-only functions
;; =====================

;; Get how many services a user has registered (for UI: "3/5 used")
(define-read-only (get-service-count (owner principal))
  (default-to u0 (map-get? service-count owner))
)

;; Get a specific service by owner + index
(define-read-only (get-user-service (owner principal) (index uint))
  (map-get? user-services { owner: owner, index: index })
)



;; =====================
;; Public functions
;; =====================

;; Register a new service (max 5 per user)
;; Returns the index that was assigned
(define-public (register-service
  (name (string-ascii 64))
  (description (string-ascii 256))
  (url (string-ascii 256))
  (price-per-call uint)
)
  (let (
    (count (default-to u0 (map-get? service-count contract-caller)))
  )
    (asserts! (> (len name) u0) ERR-EMPTY-NAME)
    (asserts! (> (len url) u0) ERR-EMPTY-URL)
    (asserts! (> price-per-call u0) ERR-ZERO-PRICE)
    (asserts! (< count MAX-SERVICES-PER-USER) ERR-MAX-SERVICES)

    ;; Store at the next index
    (map-set user-services { owner: contract-caller, index: count } {
      name: name,
      description: description,
      url: url,
      price-per-call: price-per-call,
      active: true
    })

    ;; Increment user's service counter
    (map-set service-count contract-caller (+ count u1))
    (ok count)
  )
)

;; Update service price (caller must be owner - enforced by map key)
(define-public (update-price (index uint) (new-price uint))
  (let ((service (unwrap! (map-get? user-services { owner: contract-caller, index: index }) ERR-SERVICE-NOT-FOUND)))
    (asserts! (> new-price u0) ERR-ZERO-PRICE)
    (map-set user-services { owner: contract-caller, index: index }
      (merge service { price-per-call: new-price }))
    (ok true)
  )
)

;; Update service URL (caller must be owner)
(define-public (update-url (index uint) (new-url (string-ascii 256)))
  (let ((service (unwrap! (map-get? user-services { owner: contract-caller, index: index }) ERR-SERVICE-NOT-FOUND)))
    (asserts! (> (len new-url) u0) ERR-EMPTY-URL)
    (map-set user-services { owner: contract-caller, index: index }
      (merge service { url: new-url }))
    (ok true)
  )
)

;; Deactivate a service (caller must be owner)
(define-public (deactivate-service (index uint))
  (let ((service (unwrap! (map-get? user-services { owner: contract-caller, index: index }) ERR-SERVICE-NOT-FOUND)))
    (map-set user-services { owner: contract-caller, index: index }
      (merge service { active: false }))
    (ok true)
  )
)

;; Reactivate a service (caller must be owner)
(define-public (activate-service (index uint))
  (let ((service (unwrap! (map-get? user-services { owner: contract-caller, index: index }) ERR-SERVICE-NOT-FOUND)))
    (map-set user-services { owner: contract-caller, index: index }
      (merge service { active: true }))
    (ok true)
  )
)
