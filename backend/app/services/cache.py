"""
Redis cache service for high-performance shared data access.
Falls back to in-memory cache if Redis is unavailable.
"""
import json
import logging
from typing import Any, Optional
from datetime import timedelta

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from ..config import settings

logger = logging.getLogger(__name__)


class CacheService:
    """Cache service with Redis backend and in-memory fallback"""
    
    def __init__(self):
        self._redis_client: Optional[Any] = None
        self._memory_cache: dict = {}
        self._use_redis = False
        
        if REDIS_AVAILABLE and settings.cache.redis_url:
            try:
                self._redis_client = redis.from_url(
                    settings.cache.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=2,
                    socket_timeout=2
                )
                # Test connection
                self._redis_client.ping()
                self._use_redis = True
                logger.info("Redis cache initialized successfully")
            except Exception as e:
                logger.warning(f"Redis connection failed, using in-memory cache: {e}")
                self._redis_client = None
        else:
            logger.info("Using in-memory cache (Redis not configured)")
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            if self._use_redis and self._redis_client:
                value = self._redis_client.get(key)
                if value:
                    return json.loads(value)
            else:
                return self._memory_cache.get(key)
        except Exception as e:
            logger.error(f"Cache get error for key {key}: {e}")
        return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache with optional TTL (seconds)"""
        try:
            if ttl is None:
                ttl = settings.cache.default_ttl
            
            if self._use_redis and self._redis_client:
                serialized = json.dumps(value)
                self._redis_client.setex(key, ttl, serialized)
            else:
                # In-memory cache doesn't support TTL, but we store anyway
                self._memory_cache[key] = value
            return True
        except Exception as e:
            logger.error(f"Cache set error for key {key}: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete value from cache"""
        try:
            if self._use_redis and self._redis_client:
                self._redis_client.delete(key)
            else:
                self._memory_cache.pop(key, None)
            return True
        except Exception as e:
            logger.error(f"Cache delete error for key {key}: {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern (Redis only)"""
        count = 0
        try:
            if self._use_redis and self._redis_client:
                keys = self._redis_client.keys(pattern)
                if keys:
                    count = self._redis_client.delete(*keys)
            else:
                # In-memory: simple prefix matching
                keys_to_delete = [k for k in self._memory_cache.keys() if k.startswith(pattern.replace('*', ''))]
                for key in keys_to_delete:
                    del self._memory_cache[key]
                count = len(keys_to_delete)
        except Exception as e:
            logger.error(f"Cache delete_pattern error for pattern {pattern}: {e}")
        return count
    
    def clear_all(self) -> bool:
        """Clear entire cache (use with caution)"""
        try:
            if self._use_redis and self._redis_client:
                self._redis_client.flushdb()
            else:
                self._memory_cache.clear()
            return True
        except Exception as e:
            logger.error(f"Cache clear error: {e}")
            return False
    
    def health_check(self) -> dict:
        """Check cache health"""
        if self._use_redis and self._redis_client:
            try:
                self._redis_client.ping()
                info = self._redis_client.info()
                return {
                    "status": "healthy",
                    "backend": "redis",
                    "connected_clients": info.get("connected_clients", 0),
                    "used_memory_human": info.get("used_memory_human", "unknown")
                }
            except Exception as e:
                return {
                    "status": "unhealthy",
                    "backend": "redis",
                    "error": str(e)
                }
        else:
            return {
                "status": "healthy",
                "backend": "memory",
                "keys_cached": len(self._memory_cache)
            }


# Global cache instance
cache = CacheService()


# Helper functions for common cache keys
def get_quote_cache_key(symbol: str) -> str:
    """Generate cache key for quote data"""
    return f"quote:{symbol}"


def get_portfolio_cache_key(account: str = "ALL") -> str:
    """Generate cache key for portfolio data"""
    return f"portfolio:{account}"


def get_positions_cache_key(account: str = "ALL") -> str:
    """Generate cache key for positions data"""
    return f"positions:{account}"


def get_market_status_cache_key() -> str:
    """Generate cache key for market status"""
    return "market:status"
