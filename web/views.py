from django.http import HttpResponse

def index(request):
    return HttpResponse("<ul><li><a href=\"missions\">Missions</a></li><li><a href=\"tools\">Tools</a></li></ul>")

def tools(request):
    return HttpResponse("<ul><li><a href=\"/\">Home</a></li><li><a href=\"missions\">Missions</a></li></ul>")