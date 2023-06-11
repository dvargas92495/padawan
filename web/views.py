from django.http import HttpResponse

def index(request):
    return HttpResponse("<ul><li><a href=\"missions\">Missions</a></li></ul>")