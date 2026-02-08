import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AspectRatio } from '@/components/ui/aspect-ratio';

export function EventCardSkeleton() {
  return (
    <Card className="overflow-hidden rounded-xl">
      {/* Banner placeholder */}
      <AspectRatio ratio={3 / 2}>
        <Skeleton className="w-full h-full" />
      </AspectRatio>

      <CardContent className="p-4 space-y-3">
        {/* Nome e Preço */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-7 w-24" />
        </div>

        {/* Data e Local */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Empresa */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>

        {/* Botão */}
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

export function EventCardSkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <EventCardSkeleton />
      <EventCardSkeleton />
      <EventCardSkeleton />
      <div className="hidden sm:block">
        <EventCardSkeleton />
      </div>
      <div className="hidden lg:block">
        <EventCardSkeleton />
      </div>
      <div className="hidden lg:block">
        <EventCardSkeleton />
      </div>
    </div>
  );
}
